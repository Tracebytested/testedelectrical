import { NextRequest, NextResponse } from 'next/server'
import { generateReportFromDescription, processCreateWorkOrderSMS } from '@/lib/ai'
import { findAllInspectionReports, downloadDriveFile, getRecentJobPhotos } from '@/lib/drive'
import { createCalendarEvent } from '@/lib/calendar'
import { sendSMS } from '@/lib/sms'
import { generateReportPDF, generateInvoicePDF, generateQuotePDF } from '@/lib/pdf'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { query } from '@/lib/db'
import {
  getNextReportNumber, getNextInvoiceNumber, getNextBeezyInvoiceNumber, getNextJobNumber, getNextQuoteNumber,
  calculateLineItems, formatDate, formatDateLong, findOrCreateClient
} from '@/lib/utils'
import { BUSINESS } from '@/lib/constants'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const AUTHORISED_NUMBERS = ['+61407180596', '+61429604291']

async function reply(from: string, msg: string) { await sendSMS(from, msg) }

function extractEmail(t: string): string | null {
  const m = t.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
  return m ? m[0] : null
}

function extractPrice(t: string): number {
  const m = t.match(/\$([\d,]+(?:\.\d{1,2})?)/)
  return m ? parseFloat(m[1].replace(/,/g, '')) : 0
}

async function findClientByName(name: string): Promise<any | null> {
  const words = name.split(/\s+/).filter(w => w.length >= 3)
  for (const w of words) {
    const r = await query('SELECT * FROM clients WHERE name ILIKE $1 LIMIT 1', ['%' + w + '%'])
    if (r.rows.length > 0) return r.rows[0]
  }
  return null
}

async function findJobByRef(body: string): Promise<any | null> {
  const ref = body.match(/([JW]O?[-#]?\d{3,6})/i)
  if (ref) {
    const r = await query('SELECT j.*, c.name as client_name, c.email as client_email, c.company as client_company, j.agency_contact FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.job_number ILIKE $1 OR j.work_order_ref ILIKE $1 LIMIT 1', ['%' + ref[1] + '%'])
    if (r.rows.length > 0) return r.rows[0]
  }
  return null
}

// Store pending actions waiting for confirmation
async function savePendingAction(from: string, plan: any) {
  await query('CREATE TABLE IF NOT EXISTS pending_actions (id SERIAL PRIMARY KEY, from_number VARCHAR(20), plan JSONB, created_at TIMESTAMP DEFAULT NOW())')
  // Clear old pending actions for this number
  await query('DELETE FROM pending_actions WHERE from_number = $1', [from])
  await query('INSERT INTO pending_actions (from_number, plan) VALUES ($1, $2)', [from, JSON.stringify(plan)])
}

async function getPendingAction(from: string): Promise<any | null> {
  try {
    const r = await query('SELECT plan, created_at FROM pending_actions WHERE from_number = $1 ORDER BY created_at DESC LIMIT 1', [from])
    if (r.rows.length === 0) return null
    // Expire after 10 minutes
    const created = new Date(r.rows[0].created_at)
    if (Date.now() - created.getTime() > 10 * 60 * 1000) {
      await query('DELETE FROM pending_actions WHERE from_number = $1', [from])
      return null
    }
    return r.rows[0].plan
  } catch { return null }
}

async function clearPendingAction(from: string) {
  await query('DELETE FROM pending_actions WHERE from_number = $1', [from])
}

// Execute a confirmed plan
async function executePlan(plan: any, from: string) {
  const actions: string[] = plan.actions || []
  const price = plan.price || 0
  let email = plan.resolvedEmail || null
  let clientName = plan.resolvedClientName || plan.clientName || 'Client'
  let billToName = plan.resolvedBillToName || plan.billToName || clientName
  let companyName = plan.resolvedCompanyName || undefined
  let siteAddress = plan.resolvedAddress || plan.siteAddress || ''
  let jobRef = plan.resolvedJobId ? await query('SELECT j.*, c.name as client_name, c.email as client_email, c.company as client_company, j.agency_contact FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.id = $1', [plan.resolvedJobId]).then(r => r.rows[0] || null) : null

  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
  const results: string[] = []

  // CREATE JOB
  if (actions.includes('create_job')) {
    const cid = await findOrCreateClient({ name: clientName, is_agency: false })
    const jn = await getNextJobNumber()
    await query('INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source) VALUES ($1,$2,$3,$4,$5,\'pending\',\'sms\')',
      [jn, cid, plan.jobTitle || 'New Job', plan.jobDescription || '', siteAddress])
    results.push('Work order ' + jn + ' created')
  }

  // ATTACH FROM DRIVE
  if (actions.includes('attach_from_drive')) {
    const terms: string[] = plan.driveSearchTerms || []
    for (const term of terms) {
      if (!term) continue
      let files = await findAllInspectionReports(term)
      if (plan.driveRecentOnly) {
        const start = new Date(); start.setHours(0, 0, 0, 0)
        files = files.filter((f: any) => !f.modifiedTime || new Date(f.modifiedTime) >= start)
      }
      for (const file of files) {
        if (!attachments.find(a => a.filename === file.name)) {
          const name = (file.name || '').toLowerCase()
          const mime = (file.mimeType || '').toLowerCase()
          const isImage = mime.includes('image') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')

          // Skip images if they are only going in the report, not email attachment
          if (isImage && plan.driveImagesInReport && !plan.driveImagesAttachEmail) continue

          const buf = await downloadDriveFile(file.id)
          let fn = (file.name as string).replace(/\//g, '-').replace(/\\/g, '-')
          if (!fn.toLowerCase().endsWith('.pdf') && !fn.toLowerCase().endsWith('.jpg') && !fn.toLowerCase().endsWith('.png')) fn += '.pdf'
          attachments.push({ filename: fn, content: buf, contentType: file.mimeType || 'application/pdf' })
        }
      }
    }
    if (attachments.length > 0) results.push(attachments.length + ' file' + (attachments.length > 1 ? 's' : '') + ' from Drive')
  }

  // GENERATE REPORT
  if (actions.includes('generate_report')) {
    const reportData = await generateReportFromDescription({
      nathanDescription: plan.reportDescription || plan.jobDescription || '',
      jobTitle: plan.jobTitle || jobRef?.title || 'Service Report',
      client: clientName, siteAddress: siteAddress, workOrderRef: jobRef?.work_order_ref
    })
    if (price > 0) reportData.price_ex_gst = price

    let photos: Buffer[] = []
    try {
      // Get photos from Work Images folder
      const pf = await getRecentJobPhotos(siteAddress)
      if (pf.length > 0) {
        const bufs = await Promise.all(pf.map((f: any) => downloadDriveFile(f.id).catch(() => null)))
        photos = bufs.filter((b): b is Buffer => b !== null)
      }
      // Also include Drive search images in report if requested
      if (plan.driveImagesInReport && plan.driveSearchTerms) {
        for (const term of plan.driveSearchTerms) {
          const driveFiles = await findAllInspectionReports(term)
          const imageFiles = driveFiles.filter((f: any) => {
            const name = (f.name || '').toLowerCase()
            const mime = (f.mimeType || '').toLowerCase()
            return mime.includes('image') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')
          })
          for (const imgFile of imageFiles) {
            const buf = await downloadDriveFile(imgFile.id).catch(() => null)
            if (buf && !photos.find(p => p.equals(buf))) photos.push(buf)
          }
        }
      }
    } catch {}

    const rn = await getNextReportNumber()
    if (jobRef) {
      await query('INSERT INTO reports (report_number, job_id, client_id, title, task_information, investigation_findings, work_undertaken, remedial_action, recommended_followup, price_ex_gst, conducted_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,\'draft\')',
        [rn, jobRef.id, jobRef.client_id, reportData.title, reportData.task_information, reportData.investigation_findings, reportData.work_undertaken, reportData.remedial_action, reportData.recommended_followup, reportData.price_ex_gst, new Date()])
    }
    const rpdf = await generateReportPDF({
      photos, report_number: rn, conducted_on: formatDateLong(new Date()), title: reportData.title,
      status: 'Completed', site_location: siteAddress, work_order: jobRef?.work_order_ref || jobRef?.job_number || '',
      client: clientName, contact: jobRef?.agency_contact || '', date_completed: formatDate(new Date()),
      task_information: reportData.task_information, investigation_findings: reportData.investigation_findings,
      work_undertaken: reportData.work_undertaken, remedial_action: reportData.remedial_action,
      recommended_followup: reportData.recommended_followup, price_ex_gst: reportData.price_ex_gst
    })
    attachments.push({ filename: rn + '_Service_Report.pdf', content: rpdf, contentType: 'application/pdf' })
    if (jobRef) await query("UPDATE reports SET status='sent', sent_at=NOW() WHERE report_number=$1", [rn])
    results.push('Report ' + rn)
  }

  // GENERATE INVOICE
  if (actions.includes('generate_invoice') && price > 0) {
    let items = (plan.lineItems || []).filter((i: any) => i.rate > 0 && i.qty > 0)
    if (items.length === 0) items = [{ description: plan.jobTitle || 'Electrical Services', qty: 1, rate: price }]
    const { lineItems, subtotal, gst, total } = calculateLineItems(items)
    const invNum = await getNextBeezyInvoiceNumber()
    if (jobRef) {
      await query('INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,\'draft\',$8)',
        [invNum, jobRef.id, jobRef.client_id, JSON.stringify(lineItems), subtotal, gst, total, new Date(Date.now() + 7 * 86400000)])
    }
    const invPDF = await generateInvoicePDF({
      invoice_number: invNum, date: formatDate(new Date()),
      bill_to_name: billToName, bill_to_company: companyName, bill_to_address: siteAddress,
      line_items: lineItems, subtotal, gst, total
    })
    attachments.push({ filename: 'Invoice_' + invNum + '.pdf', content: invPDF, contentType: 'application/pdf' })
    if (jobRef) await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invNum])
    results.push('Invoice ' + invNum + ' ($' + total.toFixed(2) + ' inc GST)')
  }

  // GENERATE QUOTE
  if (actions.includes('generate_quote') && price > 0) {
    let items = (plan.lineItems || []).filter((i: any) => i.rate > 0 && i.qty > 0)
    if (items.length === 0) items = [{ description: plan.jobTitle || 'Electrical Services', qty: 1, rate: price }]
    const { lineItems, subtotal, gst, total } = calculateLineItems(items)
    const qn = await getNextQuoteNumber()
    const qPDF = await generateQuotePDF({
      quote_number: qn, date: formatDate(new Date()), quote_to_name: billToName, quote_to_address: siteAddress,
      line_items: lineItems, subtotal, gst, total, notes: []
    })
    attachments.push({ filename: 'Quote_' + qn + '.pdf', content: qPDF, contentType: 'application/pdf' })
    results.push('Quote ' + qn + ' ($' + total.toFixed(2) + ' inc GST)')
  }

  // BOOK CALENDAR
  if (actions.includes('book_calendar') && plan.calendarDate) {
    const event = await createCalendarEvent({
      title: plan.jobTitle || 'Job', description: plan.jobDescription,
      location: siteAddress, startDate: plan.calendarDate, startTime: plan.calendarTime
    })
    if (event) {
      const ds = new Date(plan.calendarDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
      results.push('Booked ' + ds + (plan.calendarTime ? ' at ' + plan.calendarTime : ''))
    }
  }

  // SEND EMAIL
  if (attachments.length > 0 && email) {
    const emailBody = plan.customEmailBody
      ? '<p>' + plan.customEmailBody.split('\n').join('<br>') + '</p>'
      : '<p>Hi,</p><p>Please find attached documents as requested.</p>'

    await sendEmail({
      to: email,
      subject: results.join(' + ') + ' - Tested Electrical',
      body: buildEmailHTML(emailBody + '<p>Any questions or issues opening please let me know.</p><p>Kind Regards,<br>Nathan\'s Assistant B</p>'),
      attachments
    })
    await reply(from, 'SENT! ' + results.join(', ') + ' to ' + email)
  } else if (attachments.length > 0 && !email) {
    await reply(from, results.join(', ') + ' generated but no email found. Reply with the email to send.')
  } else if (results.length > 0) {
    await reply(from, results.join(', ') + ' done.')
  }

  if (actions.includes('generate_report') && jobRef) {
    await query("UPDATE jobs SET status='completed', completed_date=$1, updated_at=NOW() WHERE id=$2", [new Date(), jobRef.id])
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

    await query('INSERT INTO sms_log (direction, from_number, to_number, body) VALUES ($1,$2,$3,$4)', ['inbound', from, process.env.TWILIO_PHONE_NUMBER, body])

    const lower = body.toLowerCase().trim()

    // Check if this is a confirmation or correction to a pending action
    const pending = await getPendingAction(from)
    if (pending) {
      if (lower === 'yes' || lower === 'y' || lower === 'send' || lower === 'confirm' || lower === 'go' || lower === 'send it' || lower === 'yep' || lower === 'yeah') {
        await clearPendingAction(from)
        await reply(from, 'On it...')
        await executePlan(pending, from)
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      } else if (lower === 'no' || lower === 'cancel' || lower === 'stop' || lower === 'nah') {
        await clearPendingAction(from)
        await reply(from, 'Cancelled. Nothing was sent.')
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      } else {
        // Treat as a correction - re-process with the new info added to the original
        await clearPendingAction(from)
        // Fall through to process as a new message with context
      }
    }

    // Fetch recent conversation history
    const recentMessages = await query(
      "SELECT direction, body, created_at FROM sms_log WHERE (from_number = $1 OR to_number = $1) AND created_at > NOW() - INTERVAL '30 minutes' ORDER BY created_at DESC LIMIT 6",
      [from]
    )
    const conversationHistory = recentMessages.rows.reverse().map((m: any) =>
      (m.direction === 'inbound' ? 'Nathan: ' : 'Beezy: ') + m.body
    ).join('\n')

    // AI interprets the message
    const today = new Date().toISOString().split('T')[0]
    const aiPlan = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 800,
      messages: [{ role: 'user', content: 'You are Beezy, AI admin for Tested Electrical. Today is ' + today + '.\n\nRecent conversation:\n' + conversationHistory + '\n\nNathan sent this SMS: "' + body.replace(/"/g, "'") + '"\n\nAnalyse what Nathan wants and return ONLY valid JSON:\n{\n  "actions": ["create_job", "generate_report", "generate_invoice", "generate_quote", "attach_from_drive", "book_calendar", "general_reply"],\n  "driveSearchTerms": ["search term"],\n  "driveRecentOnly": false,\n  "clientName": "company/agency",\n  "billToName": "person liable for payment",\n  "recipientEmail": "email if mentioned",\n  "ccEmail": "cc email if mentioned",\n  "siteAddress": "address",\n  "price": 0,\n  "lineItems": [{"description": "...", "qty": 1, "rate": 100}],\n  "customEmailBody": "custom email text if specified",\n  "jobDescription": "description",\n  "jobTitle": "brief title",\n  "calendarDate": "YYYY-MM-DD",\n  "calendarTime": "HH:MM",\n  "reportDescription": "what was done",\n  "reply": "brief reply if general question"\n}\n\nRules:\n- actions is an array - multiple actions can happen together\n- lineItems must have rate > 0, total must equal price\n- Only include actions Nathan actually asked for\n- driveImagesInReport: true if Nathan says include/embed/put images IN the report\n- driveImagesAttachEmail: true if Nathan says attach images TO the email\n- If both mentioned, set both true\n- Default attach images to email if unspecified\n- price is ex GST' }]
    })

    let plan: any = {}
    try {
      const t = aiPlan.content[0].type === 'text' ? aiPlan.content[0].text : '{}'
      plan = JSON.parse(t.replace(/```json|```/g, '').trim())
    } catch {
      await reply(from, 'Got your message but couldn\'t understand it. Try rephrasing.')
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    const actions: string[] = plan.actions || []

    // General reply - no confirmation needed
    if (actions.length === 1 && actions[0] === 'general_reply') {
      await reply(from, plan.reply || 'Got it! Check the dashboard.')
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // Create job - no confirmation needed
    if (actions.length === 1 && actions[0] === 'create_job') {
      const cid = await findOrCreateClient({ name: plan.clientName || 'TBC', is_agency: false })
      const jn = await getNextJobNumber()
      await query('INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source) VALUES ($1,$2,$3,$4,$5,\'pending\',\'sms\')',
        [jn, cid, plan.jobTitle || 'New Job', plan.jobDescription || body, plan.siteAddress || ''])
      await reply(from, 'Work order ' + jn + ' created! "' + (plan.jobTitle || 'New Job') + '"')
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // Calendar booking - no confirmation needed
    if (actions.length === 1 && actions[0] === 'book_calendar' && plan.calendarDate) {
      const event = await createCalendarEvent({
        title: plan.jobTitle || 'Job', description: plan.jobDescription,
        location: plan.siteAddress, startDate: plan.calendarDate, startTime: plan.calendarTime
      })
      if (event) {
        const ds = new Date(plan.calendarDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        await reply(from, 'Booked! "' + event.title + '"\n' + ds + (plan.calendarTime ? ' at ' + plan.calendarTime : '') + '\nAdded to Google Calendar.')
      } else {
        await reply(from, 'Couldn\'t add to calendar.')
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // For anything that sends an email/document - CONFIRM FIRST
    const price = plan.price || extractPrice(body)
    let email = plan.recipientEmail || extractEmail(body) || null
    let clientName = plan.clientName || 'Client'
    let billToName = plan.billToName || clientName
    let companyName: string | undefined
    let siteAddress = plan.siteAddress || ''
    let jobRef = await findJobByRef(body)

    const dbClient = await findClientByName(clientName)
    if (dbClient) {
      if (!email && dbClient.email) email = dbClient.email
      if (dbClient.company) companyName = dbClient.company
      else companyName = dbClient.name
      clientName = dbClient.name
    }
    if (!email && jobRef?.client_email) email = jobRef.client_email
    if (!siteAddress && jobRef?.site_address) siteAddress = jobRef.site_address
    if (!companyName && clientName !== billToName) companyName = clientName
    if (billToName === clientName && !plan.billToName) billToName = clientName

    // Build confirmation summary
    const summaryParts: string[] = []

    if (actions.includes('attach_from_drive')) {
      const terms = (plan.driveSearchTerms || []).join(', ')
      summaryParts.push('Attach files from Drive matching "' + terms + '"')
    }
    if (actions.includes('generate_report')) {
      summaryParts.push('Generate service report' + (plan.driveImagesInReport ? ' (with images embedded)' : ''))
    }
    if (actions.includes('generate_invoice') && price > 0) {
      const items = (plan.lineItems || []).filter((i: any) => i.rate > 0)
      if (items.length > 0) {
        const itemDesc = items.map((i: any) => i.description + ' x' + i.qty + ' $' + i.rate).join(', ')
        summaryParts.push('Invoice: ' + itemDesc + ' (total $' + (price * 1.1).toFixed(2) + ' inc GST)')
      } else {
        summaryParts.push('Invoice for $' + (price * 1.1).toFixed(2) + ' inc GST')
      }
    }
    if (actions.includes('generate_quote') && price > 0) {
      summaryParts.push('Quote for $' + (price * 1.1).toFixed(2) + ' inc GST')
    }

    const sendTo = email || 'NO EMAIL FOUND'
    const ccTo = plan.ccEmail || ''
    const billTo = billToName + (companyName && companyName !== billToName ? ' (' + companyName + ')' : '')

    // Save resolved details into plan for execution
    plan.resolvedEmail = email
    plan.ccEmail = plan.ccEmail || null
    plan.resolvedClientName = clientName
    plan.resolvedBillToName = billToName
    plan.resolvedCompanyName = companyName
    plan.resolvedAddress = siteAddress
    plan.resolvedJobId = jobRef?.id || null
    plan.price = price

    // Save pending and ask for confirmation
    await savePendingAction(from, plan)

    const confirmMsg = 'CONFIRM:\n' + summaryParts.join('\n') + '\n\nSend to: ' + sendTo + (ccTo ? '\nCC: ' + ccTo : '') + '\nBill to: ' + billTo + (siteAddress ? '\nAddress: ' + siteAddress : '') + '\n\nReply YES to send, NO to cancel, or correct any details.'

    await reply(from, confirmMsg)

    return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
  } catch (error: any) {
    console.error('SMS webhook error:', error)
    try { await sendSMS(from, 'Something went wrong. Check the dashboard.') } catch {}
    return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
  }
}
