import { NextRequest, NextResponse } from 'next/server'
import { processJobUpdateSMS, generateReportFromDescription, processCreateWorkOrderSMS } from '@/lib/ai'
import { findAllInspectionReports, downloadDriveFile, getRecentJobPhotos } from '@/lib/drive'
import { createCalendarEvent, parseBookingFromSMS } from '@/lib/calendar'
import { sendSMS } from '@/lib/sms'
import { generateReportPDF, generateInvoicePDF } from '@/lib/pdf'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { query } from '@/lib/db'
import {
  getNextReportNumber,
  getNextInvoiceNumber,
  getNextJobNumber,
  calculateLineItems,
  formatDate,
  formatDateLong,
  findOrCreateClient
} from '@/lib/utils'
import { BUSINESS } from '@/lib/constants'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const AUTHORISED_NUMBERS = [
  '+61407180596',
  '+61429604291',
]

async function replyTo(from: string, message: string) {
  await sendSMS(from, message)
}

const DRIVE_KEYWORDS = [
  'google drive', 'from drive', 'on drive', 'in drive',
  'send the inspection', 'send inspection report', 'attach the report from drive',
  'send the safety', 'attach inspection', 'send from drive',
  'safety inspection report', 'send the certificate',
  'attach both reports', 'attach the reports', 'attach report',
  'reports i have made', 'reports i made', 'reports from my drive',
  'files from drive', 'attach files', 'send the files',
  'i have made on google drive', 'i made on google drive',
  'attach both', 'send both reports'
]

const CALENDAR_KEYWORDS = [
  'add to calendar', 'put in calendar',
  'schedule a job', 'add job to calendar', 'book for', 'schedule for',
  'book the job', 'diary', 'what have i got', 'whats on', "what's on"
]

const INVOICE_ONLY_KEYWORDS = [
  'just invoice', 'only invoice', 'invoice only', 'send an invoice',
  'create an invoice', 'generate an invoice', 'make an invoice',
  'invoice nathan', 'invoice me', 'invoice them for', 'invoice client for',
  'send invoice for', 'please invoice'
]

const COMPLETE_KEYWORDS = [
  'just finished', 'just done', 'completed', 'all done', 'job done',
  'finished the', 'done the', 'wrapped up', 'just completed',
  'invoice', 'invoice client', 'send invoice', 'invoice them',
  'fill report', 'complete report', 'write report', 'send report',
  'charge them', 'charge client', 'bill them', 'bill client',
  'report and invoice', 'invoice and report', 'has been completed',
  'been completed', 'generate a report', 'please generate'
]

const CREATE_KEYWORDS = [
  'create a work order', 'new work order', 'add a job',
  'new job for', 'create job', 'log a job', 'book a job'
]

function detectIntent(text: string): 'complete' | 'create' | 'drive' | 'calendar' | 'invoice_only' | 'unknown' {
  const lower = text.toLowerCase()
  for (const kw of DRIVE_KEYWORDS) {
    if (lower.includes(kw)) return 'drive'
  }
  for (const kw of CALENDAR_KEYWORDS) {
    if (lower.includes(kw)) return 'calendar'
  }
  for (const kw of INVOICE_ONLY_KEYWORDS) {
    if (lower.includes(kw)) return 'invoice_only'
  }
  for (const kw of CREATE_KEYWORDS) {
    if (lower.includes(kw)) return 'create'
  }
  for (const kw of COMPLETE_KEYWORDS) {
    if (lower.includes(kw)) return 'complete'
  }
  return 'unknown'
}

function extractEmail(text: string): string | null {
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
  return match ? match[0] : null
}

function extractPrice(text: string): number {
  const match = text.match(/\$([\d,]+(?:\.\d{1,2})?)/)
  if (!match) return 0
  return parseFloat(match[1].replace(/,/g, ''))
}

function extractStreetName(text: string): string {
  const SKIP_WORDS = new Set([
    'invoice', 'attach', 'both', 'reports', 'report', 'drive', 'google',
    'send', 'made', 'have', 'unit', 'please', 'that', 'the', 'and',
    'for', 'from', 'with', 'this', 'them', 'also', 'just', 'all',
    'my', 'today', 'uploaded', 'street', 'road', 'avenue', 'both',
    'documents', 'document', 'files', 'file', 'kilaris'
  ])
  const streetSuffixMatch = text.match(/([a-zA-Z]{4,})\s+(?:st|street|rd|road|ave|avenue|blvd|dr|drive)/i)
  if (streetSuffixMatch && !SKIP_WORDS.has(streetSuffixMatch[1].toLowerCase())) return streetSuffixMatch[1]
  const afterUnit = text.match(/unit\s+\d+\s+([a-zA-Z]{4,})/i)
  if (afterUnit && !SKIP_WORDS.has(afterUnit[1].toLowerCase())) return afterUnit[1]
  const words = text.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/)
  for (const word of words) {
    if (word.length >= 4 && !SKIP_WORDS.has(word.toLowerCase())) return word
  }
  return ''
}

async function findJob(body: string): Promise<any | null> {
  const jobRefMatch = body.match(/([JW]O?[-#]?\d{3,6})/i)
  if (jobRefMatch) {
    const ref = jobRefMatch[1]
    const result = await query(
      'SELECT j.*, c.name as client_name, c.email as client_email, j.agency_contact FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.job_number ILIKE $1 OR j.work_order_ref ILIKE $1 LIMIT 1',
      ['%' + ref + '%']
    )
    if (result.rows.length > 0) return result.rows[0]
  }
  const addressMatch = body.match(/(\d+\s+[A-Za-z]+\s+(?:st|street|rd|road|ave|avenue|blvd|drive|dr|ct|court|way|cres|crescent|pl|place)[,\s])/i)
  if (addressMatch) {
    const frag = addressMatch[1].trim().replace(/,$/, '')
    const result = await query(
      'SELECT j.*, c.name as client_name, c.email as client_email, j.agency_contact FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.site_address ILIKE $1 AND j.status IN (\'pending\', \'active\') ORDER BY j.created_at DESC LIMIT 1',
      ['%' + frag + '%']
    )
    if (result.rows.length > 0) return result.rows[0]
  }
  const words = body.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3)
  const skip = new Set(['invoice', 'report', 'send', 'attach', 'beezy', 'hey', 'please', 'and', 'the', 'for', 'client', 'just', 'only', 'create', 'make', 'generate'])
  for (const word of words) {
    if (skip.has(word)) continue
    const result = await query(
      'SELECT j.*, c.name as client_name, c.email as client_email, j.agency_contact FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE c.name ILIKE $1 ORDER BY j.created_at DESC LIMIT 1',
      ['%' + word + '%']
    )
    if (result.rows.length > 0) return result.rows[0]
  }
  const result = await query(
    'SELECT j.*, c.name as client_name, c.email as client_email, j.agency_contact FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.status IN (\'pending\', \'active\') ORDER BY j.created_at DESC LIMIT 1'
  )
  return result.rows.length > 0 ? result.rows[0] : null
}

async function findClientByName(body: string): Promise<any | null> {
  const words = body.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3)
  const skip = new Set(['invoice', 'report', 'send', 'attach', 'beezy', 'hey', 'please', 'and', 'the', 'for', 'client', 'just', 'only', 'create', 'make', 'generate', 'light', 'globe', 'replacement', 'electrical'])
  for (const word of words) {
    if (skip.has(word)) continue
    const result = await query('SELECT * FROM clients WHERE name ILIKE $1 LIMIT 1', ['%' + word + '%'])
    if (result.rows.length > 0) return result.rows[0]
  }
  return null
}

async function generateAndSendReportInvoice(job: any, body: string, from: string) {
  let photos: Buffer[] = []
  try {
    const photoFiles = await getRecentJobPhotos(job.site_address)
    if (photoFiles.length > 0) {
      const buffers = await Promise.all(photoFiles.slice(0, 6).map((f: any) => downloadDriveFile(f.id).catch(() => null)))
      photos = buffers.filter((b): b is Buffer => b !== null)
    }
  } catch (e) { console.error('Photo fetch error:', e) }

  const reportData = await generateReportFromDescription({
    nathanDescription: body, jobTitle: job.title, client: job.client_name,
    siteAddress: job.site_address, workOrderRef: job.work_order_ref
  })
  const smsPrice = extractPrice(body)
  if (smsPrice > 0) reportData.price_ex_gst = smsPrice
  const smsEmail = extractEmail(body)
  const clientEmail = smsEmail || job.client_email
  const reportNumber = await getNextReportNumber()
  const today = new Date()

  await query(
    'INSERT INTO reports (report_number, job_id, client_id, title, task_information, investigation_findings, work_undertaken, remedial_action, recommended_followup, price_ex_gst, conducted_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,\'draft\')',
    [reportNumber, job.id, job.client_id, reportData.title, reportData.task_information, reportData.investigation_findings, reportData.work_undertaken, reportData.remedial_action, reportData.recommended_followup, reportData.price_ex_gst, today]
  )
  const reportPDF = await generateReportPDF({
    photos, report_number: reportNumber, conducted_on: formatDateLong(today),
    title: reportData.title, status: 'Completed', site_location: job.site_address,
    work_order: job.work_order_ref || job.job_number, client: job.client_name,
    contact: job.agency_contact || '', date_completed: formatDate(today),
    task_information: reportData.task_information, investigation_findings: reportData.investigation_findings,
    work_undertaken: reportData.work_undertaken, remedial_action: reportData.remedial_action,
    recommended_followup: reportData.recommended_followup, price_ex_gst: reportData.price_ex_gst
  })
  const invoiceNumber = await getNextInvoiceNumber()
  const rawItems = reportData.price_ex_gst > 0
    ? [{ description: reportData.title, qty: 1, rate: reportData.price_ex_gst }]
    : [{ description: job.title, qty: 1, rate: 0 }]
  const { lineItems: calcItems, subtotal, gst, total } = calculateLineItems(rawItems)
  await query(
    'INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,\'draft\',$8)',
    [invoiceNumber, job.id, job.client_id, JSON.stringify(calcItems), subtotal, gst, total, new Date(Date.now() + 7 * 86400000)]
  )
  const invoicePDF = await generateInvoicePDF({
    invoice_number: invoiceNumber, date: formatDate(today),
    bill_to_name: job.client_name, bill_to_address: job.site_address,
    line_items: calcItems, subtotal, gst, total
  })
  await query("UPDATE jobs SET status='completed', completed_date=$1, updated_at=NOW() WHERE id=$2", [today, job.id])
  if (clientEmail) {
    if (smsEmail && smsEmail !== job.client_email) {
      await query('UPDATE clients SET email=$1 WHERE id=$2', [smsEmail, job.client_id])
    }
    await sendEmail({
      to: clientEmail,
      subject: 'Service Report & Invoice - ' + reportData.title + ' - ' + reportNumber,
      body: buildEmailHTML('<p>Hi ' + (job.agency_contact || job.client_name) + ',</p><p>Please find attached the completed service report and invoice.</p><p><strong>' + reportData.title + '</strong><br>Site: ' + job.site_address + '<br>Report: ' + reportNumber + ' | Invoice: ' + invoiceNumber + '</p><p>Total: $' + total.toFixed(2) + ' inc GST</p><p>Nathan<br>' + BUSINESS.phone + '<br>' + BUSINESS.name + '</p>'),
      attachments: [
        { filename: reportNumber + '_Service_Report.pdf', content: reportPDF, contentType: 'application/pdf' },
        { filename: 'Invoice_' + invoiceNumber + '.pdf', content: invoicePDF, contentType: 'application/pdf' }
      ]
    })
    await query("UPDATE reports SET status='sent', sent_at=NOW() WHERE report_number=$1", [reportNumber])
    await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invoiceNumber])
    await replyTo(from, 'Done! Report: ' + reportNumber + ', Invoice: ' + invoiceNumber + ' ($' + total.toFixed(2) + ' inc GST) sent to ' + clientEmail)
  } else {
    await replyTo(from, 'Done! Report ' + reportNumber + ' + Invoice ' + invoiceNumber + ' ($' + total.toFixed(2) + ') saved. No email on file.')
  }
}

export async function POST(req: NextRequest) {
  let from = '+61407180596'
  try {
    const formData = await req.formData()
    const body = formData.get('Body') as string
    from = formData.get('From') as string

    if (!AUTHORISED_NUMBERS.includes(from)) {
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    await query('INSERT INTO sms_log (direction, from_number, to_number, body) VALUES ($1, $2, $3, $4)', ['inbound', from, process.env.TWILIO_PHONE_NUMBER, body])

    const intent = detectIntent(body)

    // ---- CREATE ----
    if (intent === 'create') {
      const wo = await processCreateWorkOrderSMS(body)
      if (wo) {
        const cid = await findOrCreateClient({ name: wo.client, is_agency: false })
        const jn = await getNextJobNumber()
        await query('INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source) VALUES ($1,$2,$3,$4,$5,\'pending\',\'sms\')', [jn, cid, wo.title, wo.description, wo.site_address])
        await replyTo(from, 'Work order ' + jn + ' created! "' + wo.title + '" Client: ' + wo.client + ' Site: ' + wo.site_address)
      } else {
        await replyTo(from, 'Couldn\'t create work order.')
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // ---- DRIVE ----
    if (intent === 'drive') {
      const driveJob = await findJob(body)
      let driveEmail = extractEmail(body) || driveJob?.client_email || null
      const drivePrice = extractPrice(body)

      await replyTo(from, 'Searching Google Drive... give me a moment')

      const todayStr = new Date().toISOString().split('T')[0]
      const aiSearch = await anthropic.messages.create({
        model: 'claude-sonnet-4-5', max_tokens: 200,
        messages: [{ role: 'user', content: 'Today is ' + todayStr + '. Extract Google Drive search terms from this message. Message: "' + body + '" Return ONLY JSON: {"terms": ["search term"], "recentOnly": true/false}' }]
      })
      let searchTerms: string[] = []
      let recentOnly = false
      try {
        const t = aiSearch.content[0].type === 'text' ? aiSearch.content[0].text : '{}'
        const p = JSON.parse(t.replace(/```json|```/g, '').trim())
        searchTerms = p.terms || []
        recentOnly = p.recentOnly || false
      } catch { searchTerms = [extractStreetName(body)].filter(Boolean) }

      const foundFiles: Array<{ file: any; buffer: Buffer }> = []
      for (const term of searchTerms) {
        if (!term) continue
        let files = await findAllInspectionReports(term)
        if (recentOnly) {
          const start = new Date(); start.setHours(0, 0, 0, 0)
          files = files.filter((f: any) => !f.modifiedTime || new Date(f.modifiedTime) >= start)
        }
        for (const file of files) {
          if (!foundFiles.find(f => f.file.id === file.id)) {
            foundFiles.push({ file, buffer: await downloadDriveFile(file.id) })
          }
        }
      }
      if (foundFiles.length === 0) {
        await replyTo(from, 'Couldn\'t find matching reports in Google Drive.')
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      }

      // Extract recipient if not from job
      let driveBillTo = driveJob?.client_name || 'Client'
      let driveCompany = ''
      let driveAddr = driveJob?.site_address || ''
      if (!driveEmail || !driveJob) {
        try {
          const rAI = await anthropic.messages.create({
            model: 'claude-sonnet-4-5', max_tokens: 200,
            messages: [{ role: 'user', content: 'Extract recipient from: "' + body + '" Return ONLY JSON: {"billTo":"owner name","company":"agency name","email":"","address":""}' }]
          })
          const rt = rAI.content[0].type === 'text' ? rAI.content[0].text : '{}'
          const rp = JSON.parse(rt.replace(/```json|```/g, '').trim())
          if (rp.email && !driveEmail) driveEmail = rp.email
          if (rp.billTo) driveBillTo = rp.billTo
          if (rp.company) driveCompany = rp.company
          if (rp.address) driveAddr = rp.address
          if (!driveEmail && (rp.company || rp.billTo)) {
            const searchName = rp.company || rp.billTo
            const nw = searchName.split(' ').filter((w: string) => w.length >= 3)
            for (const w of nw) {
              const cr = await query('SELECT email, name, company FROM clients WHERE name ILIKE $1 LIMIT 1', ['%' + w + '%'])
              if (cr.rows.length > 0 && cr.rows[0].email) {
                driveEmail = cr.rows[0].email
                if (cr.rows[0].company) driveCompany = cr.rows[0].company
                else if (!driveCompany) driveCompany = cr.rows[0].name
                break
              }
            }
          }
        } catch {}
      }

      if (driveEmail) {
        const attachments: Array<{ filename: string; content: Buffer; contentType: string }> =
          foundFiles.map(({ file, buffer }) => {
            let fn = (file.name as string).replace(/\//g, '-').replace(/\\/g, '-')
            if (!fn.toLowerCase().endsWith('.pdf')) fn += '.pdf'
            return { filename: fn, content: buffer, contentType: 'application/pdf' }
          })

        let invoiceNote = ''
        if (drivePrice > 0) {
          const invNum = await getNextInvoiceNumber()
          let items: Array<{ description: string; qty: number; rate: number }> = []
          try {
            const liAI = await anthropic.messages.create({
              model: 'claude-sonnet-4-5', max_tokens: 400,
              messages: [{ role: 'user', content: 'Extract invoice line items. Total ex GST = $' + drivePrice + '. Message: "' + body + '" Return ONLY JSON array: [{"description":"...","qty":1,"rate":100}]. Every rate must be > 0.' }]
            })
            const lt = liAI.content[0].type === 'text' ? liAI.content[0].text : '[]'
            items = JSON.parse(lt.replace(/```json|```/g, '').trim()).filter((i: any) => i.rate > 0 && i.qty > 0)
            if (items.length === 0) throw new Error('empty')
          } catch { items = [{ description: 'Electrical Services', qty: 1, rate: drivePrice }] }

          const { lineItems, subtotal, gst, total } = calculateLineItems(items)
          if (driveJob) {
            await query('INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,\'draft\',$8)',
              [invNum, driveJob.id, driveJob.client_id, JSON.stringify(lineItems), subtotal, gst, total, new Date(Date.now() + 7 * 86400000)])
          }
          const invPDF = await generateInvoicePDF({
            invoice_number: invNum, date: formatDate(new Date()),
            bill_to_name: driveBillTo, bill_to_company: driveCompany || undefined,
            bill_to_address: driveAddr, line_items: lineItems, subtotal, gst, total
          })
          attachments.push({ filename: 'Invoice_' + invNum + '.pdf', content: invPDF, contentType: 'application/pdf' })
          if (driveJob) await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invNum])
          invoiceNote = ' + Invoice ' + invNum + ' ($' + total.toFixed(2) + ' inc GST)'
        }

        const fnames = foundFiles.map(f => f.file.name).join(', ')
        await sendEmail({
          to: driveEmail,
          subject: 'Inspection Reports - ' + (extractStreetName(body) || 'Property'),
          body: buildEmailHTML('<p>Hi,</p><p>Please find attached the inspection report' + (foundFiles.length > 1 ? 's' : '') + ' as requested.</p>' + (drivePrice > 0 ? '<p>Invoice included for $' + (drivePrice * 1.1).toFixed(2) + ' inc GST, due within ' + BUSINESS.payment_terms_days + ' days.</p>' : '') + '<p>Nathan<br>' + BUSINESS.phone + '<br>' + BUSINESS.name + '</p>'),
          attachments
        })
        await replyTo(from, 'Sent ' + foundFiles.length + ' file' + (foundFiles.length > 1 ? 's' : '') + invoiceNote + ' to ' + driveEmail + '\n' + fnames)
      } else {
        await replyTo(from, 'Found: ' + foundFiles.map(f => f.file.name).join(', ') + '\nReply with client email to send.')
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // ---- CALENDAR ----
    if (intent === 'calendar') {
      const booking = await parseBookingFromSMS(body)
      if (!booking) {
        await replyTo(from, 'I need a date. Try: "Book inspection at 45 Brown St for Monday 28 April at 9am"')
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      }
      const calJob = await findJob(body)
      const event = await createCalendarEvent({
        title: booking.title, description: booking.description,
        location: booking.location || calJob?.site_address,
        startDate: booking.date, startTime: booking.time, jobNumber: calJob?.job_number
      })
      if (event) {
        if (calJob) await query("UPDATE jobs SET scheduled_date=$1, status='active', updated_at=NOW() WHERE id=$2", [booking.date, calJob.id])
        const ds = new Date(booking.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        await replyTo(from, 'Booked! "' + event.title + '"\n' + ds + (booking.time ? ' at ' + booking.time : '') + '\nAdded to Google Calendar.')
      } else {
        await replyTo(from, 'Couldn\'t add to calendar.')
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // ---- INVOICE ONLY ----
    if (intent === 'invoice_only') {
      const invJob = await findJob(body)
      const invPrice = extractPrice(body)

      if (invPrice === 0) {
        await replyTo(from, 'What amount? Include a dollar amount like $400.')
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      }

      // AI extracts billing details
      let invEmail = extractEmail(body) || null
      let billToName = ''
      let clientName = 'Client'
      let clientAddress = ''
      let companyName: string | undefined
      try {
        const bAI = await anthropic.messages.create({
          model: 'claude-sonnet-4-5', max_tokens: 300,
          messages: [{ role: 'user', content: 'Extract billing details. Message: "' + body + '" Return ONLY JSON: {"clientName":"agency/company","billToName":"owner/liable person","email":"","address":""}. If no separate owner, use clientName for billToName.' }]
        })
        const bt = bAI.content[0].type === 'text' ? bAI.content[0].text : '{}'
        const bp = JSON.parse(bt.replace(/```json|```/g, '').trim())
        if (bp.clientName) clientName = bp.clientName
        if (bp.billToName) billToName = bp.billToName
        if (bp.email) invEmail = bp.email
        if (bp.address) clientAddress = bp.address
      } catch {}

      // Search clients table for email and company
      if (!invEmail) {
        const client = await findClientByName(body)
        if (client) {
          if (client.email) invEmail = client.email
          if (client.company) companyName = client.company
          else companyName = client.name
          if (!clientName || clientName === 'Client') clientName = client.name
        }
      }
      if (!invEmail && invJob?.client_email) invEmail = invJob.client_email

      if (!billToName) billToName = clientName
      if (!companyName && clientName !== billToName) companyName = clientName

      // AI extracts line items + custom email body
      let lineItemsRaw: Array<{ description: string; qty: number; rate: number }> = []
      let customEmailBody = ''
      try {
        const liAI = await anthropic.messages.create({
          model: 'claude-sonnet-4-5', max_tokens: 500,
          messages: [{ role: 'user', content: 'From this message extract: 1) Invoice line items (total must = $' + invPrice + ' ex GST), 2) Custom email body if specified. Message: "' + body + '" Return ONLY JSON: {"lineItems":[{"description":"...","qty":1,"rate":100}],"emailBody":"custom text or empty"}. Every rate must be > 0.' }]
        })
        const lt = liAI.content[0].type === 'text' ? liAI.content[0].text : '{}'
        const lp = JSON.parse(lt.replace(/```json|```/g, '').trim())
        lineItemsRaw = (lp.lineItems || []).filter((i: any) => i.rate > 0 && i.qty > 0)
        customEmailBody = lp.emailBody || ''
        if (lineItemsRaw.length === 0) throw new Error('empty')
      } catch {
        lineItemsRaw = [{ description: 'Electrical Services', qty: 1, rate: invPrice }]
      }

      const { lineItems, subtotal, gst, total } = calculateLineItems(lineItemsRaw)
      const invNumber = await getNextInvoiceNumber()
      const invToday = new Date()

      if (invJob) {
        await query('INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,\'draft\',$8)',
          [invNumber, invJob.id, invJob.client_id, JSON.stringify(lineItems), subtotal, gst, total, new Date(Date.now() + 7 * 86400000)])
      }

      const invPDF = await generateInvoicePDF({
        invoice_number: invNumber, date: formatDate(invToday),
        bill_to_name: billToName, bill_to_company: companyName, bill_to_address: clientAddress || invJob?.site_address || '',
        line_items: lineItems, subtotal, gst, total
      })

      if (invEmail) {
        const emailBody = customEmailBody
          ? '<p>' + customEmailBody.split('\n').join('<br>') + '</p>'
          : '<p>Please find attached invoice ' + invNumber + ' for $' + total.toFixed(2) + ' inc GST.</p>'
        await sendEmail({
          to: invEmail,
          subject: 'Invoice ' + invNumber + ' - Tested Electrical',
          body: buildEmailHTML(emailBody + '<p>Nathan<br>' + BUSINESS.phone + '<br>' + BUSINESS.name + '</p>'),
          attachments: [{ filename: 'Invoice_' + invNumber + '.pdf', content: invPDF, contentType: 'application/pdf' }]
        })
        if (invJob) await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invNumber])
        await replyTo(from, 'Invoice ' + invNumber + ' ($' + total.toFixed(2) + ' inc GST) sent to ' + invEmail)
      } else {
        await replyTo(from, 'Invoice ' + invNumber + ' ($' + total.toFixed(2) + ' inc GST) saved. Add ' + clientName + '\'s email in Clients page then resend.')
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // ---- COMPLETE ----
    if (intent === 'complete') {
      const completeJob = await findJob(body)
      if (completeJob) {
        await replyTo(from, 'Got it! Writing report + invoice for "' + completeJob.title + '"... 30 secs')
        await generateAndSendReportInvoice(completeJob, body, from)
      } else {
        await replyTo(from, 'Couldn\'t find a matching job.')
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // ---- UNKNOWN ----
    const unknownJob = await findJob(body)
    const aiResponse = await processJobUpdateSMS(body, unknownJob ? {
      title: unknownJob.title, client: unknownJob.client_name,
      site: unknownJob.site_address, workOrderRef: unknownJob.work_order_ref
    } : undefined)
    if (aiResponse.action === 'generate_report' && unknownJob) {
      await replyTo(from, 'Got it! Writing report + invoice for "' + unknownJob.title + '"... 30 secs')
      await generateAndSendReportInvoice(unknownJob, body, from)
    } else {
      await replyTo(from, aiResponse.response || 'Got it! Check the dashboard.')
    }

    return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
  } catch (error: any) {
    console.error('SMS webhook error:', error)
    try { await sendSMS(from, 'Something went wrong. Check the dashboard.') } catch {}
    return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
  }
}
