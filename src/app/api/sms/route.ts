import { NextRequest, NextResponse } from 'next/server'
import { generateReportFromDescription, processCreateWorkOrderSMS } from '@/lib/ai'
import { findAllInspectionReports, downloadDriveFile, getRecentJobPhotos } from '@/lib/drive'
import { createCalendarEvent } from '@/lib/calendar'
import { sendSMS } from '@/lib/sms'
import { generateReportPDF, generateInvoicePDF, generateQuotePDF } from '@/lib/pdf'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { query } from '@/lib/db'
import {
  getNextReportNumber, getNextInvoiceNumber, getNextJobNumber, getNextQuoteNumber,
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

    // ============================================================
    // STEP 1: AI interprets the ENTIRE message and decides actions
    // ============================================================
    const today = new Date().toISOString().split('T')[0]
    const aiPlan = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 800,
      messages: [{ role: 'user', content: 'You are Beezy, AI admin for Tested Electrical. Today is ' + today + '.\n\nNathan sent this SMS: "' + body.replace(/"/g, "'") + '"\n\nAnalyse what Nathan wants and return ONLY valid JSON:\n{\n  "actions": ["create_job", "generate_report", "generate_invoice", "generate_quote", "attach_from_drive", "book_calendar", "general_reply"],\n  "driveSearchTerms": ["search term 1"],\n  "driveRecentOnly": false,\n  "clientName": "company/agency name",\n  "billToName": "person liable for payment if different from client",\n  "recipientEmail": "email if mentioned",\n  "siteAddress": "address if mentioned",\n  "price": 0,\n  "lineItems": [{"description": "...", "qty": 1, "rate": 100}],\n  "customEmailBody": "custom email text if Nathan specified what the email should say",\n  "jobDescription": "description of work if creating a job",\n  "jobTitle": "brief job title",\n  "calendarDate": "YYYY-MM-DD if booking",\n  "calendarTime": "HH:MM if mentioned",\n  "reportDescription": "what was done for the report",\n  "reply": "brief SMS reply to Nathan if just a general question"\n}\n\nRules:\n- actions is an array - multiple actions can happen (e.g. attach_from_drive + generate_invoice)\n- lineItems must have rate > 0 for every row, qty * rate across all rows must equal the total price\n- If Nathan says "invoice for $X" thats generate_invoice, NOT generate_report\n- If Nathan says "generate a report" thats generate_report\n- If Nathan says both report and invoice, include both in actions\n- driveSearchTerms should be the street name or property identifier only\n- Only include actions Nathan actually asked for\n- price should be the ex GST amount Nathan specified' }]
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
    console.log('Beezy plan:', JSON.stringify(plan))

    // If just a general reply
    if (actions.length === 1 && actions[0] === 'general_reply') {
      await reply(from, plan.reply || 'Got it! Check the dashboard.')
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // ============================================================
    // STEP 2: Resolve client, email, job
    // ============================================================
    const price = plan.price || extractPrice(body)
    let email = plan.recipientEmail || extractEmail(body) || null
    let clientName = plan.clientName || 'Client'
    let billToName = plan.billToName || clientName
    let companyName: string | undefined
    let siteAddress = plan.siteAddress || ''
    let jobRef = await findJobByRef(body)

    // Look up client from DB
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

    // ============================================================
    // STEP 3: Execute actions
    // ============================================================
    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
    const results: string[] = []

    // --- CREATE JOB ---
    if (actions.includes('create_job')) {
      const cid = await findOrCreateClient({ name: clientName, is_agency: false })
      const jn = await getNextJobNumber()
      await query('INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source) VALUES ($1,$2,$3,$4,$5,\'pending\',\'sms\')',
        [jn, cid, plan.jobTitle || 'New Job', plan.jobDescription || body, siteAddress])
      results.push('Work order ' + jn + ' created')
    }

    // --- ATTACH FROM DRIVE ---
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
            const buf = await downloadDriveFile(file.id)
            let fn = (file.name as string).replace(/\//g, '-').replace(/\\/g, '-')
            if (!fn.toLowerCase().endsWith('.pdf') && !fn.toLowerCase().endsWith('.jpg') && !fn.toLowerCase().endsWith('.png')) fn += '.pdf'
            attachments.push({ filename: fn, content: buf, contentType: file.mimeType || 'application/pdf' })
          }
        }
      }
      if (attachments.length > 0) results.push(attachments.length + ' file' + (attachments.length > 1 ? 's' : '') + ' from Drive')
      else results.push('No matching files found in Drive')
    }

    // --- GENERATE REPORT ---
    if (actions.includes('generate_report') && (jobRef || siteAddress)) {
      const reportData = await generateReportFromDescription({
        nathanDescription: plan.reportDescription || body,
        jobTitle: plan.jobTitle || jobRef?.title || 'Service Report',
        client: clientName, siteAddress: siteAddress, workOrderRef: jobRef?.work_order_ref
      })
      if (price > 0) reportData.price_ex_gst = price

      let photos: Buffer[] = []
      try {
        const pf = await getRecentJobPhotos(siteAddress)
        if (pf.length > 0) {
          const bufs = await Promise.all(pf.slice(0, 6).map((f: any) => downloadDriveFile(f.id).catch(() => null)))
          photos = bufs.filter((b): b is Buffer => b !== null)
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

    // --- GENERATE INVOICE ---
    if (actions.includes('generate_invoice') && price > 0) {
      let items = (plan.lineItems || []).filter((i: any) => i.rate > 0 && i.qty > 0)
      if (items.length === 0) items = [{ description: plan.jobTitle || 'Electrical Services', qty: 1, rate: price }]

      const { lineItems, subtotal, gst, total } = calculateLineItems(items)
      const invNum = await getNextInvoiceNumber()
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

    // --- GENERATE QUOTE ---
    if (actions.includes('generate_quote') && price > 0) {
      let items = (plan.lineItems || []).filter((i: any) => i.rate > 0 && i.qty > 0)
      if (items.length === 0) items = [{ description: plan.jobTitle || 'Electrical Services', qty: 1, rate: price }]

      const { lineItems, subtotal, gst, total } = calculateLineItems(items)
      const qn = await getNextQuoteNumber()
      const qPDF = await generateQuotePDF({
        quote_number: qn, date: formatDate(new Date()),
        quote_to_name: billToName, quote_to_address: siteAddress,
        line_items: lineItems, subtotal, gst, total, notes: []
      })
      attachments.push({ filename: 'Quote_' + qn + '.pdf', content: qPDF, contentType: 'application/pdf' })
      results.push('Quote ' + qn + ' ($' + total.toFixed(2) + ' inc GST)')
    }

    // --- BOOK CALENDAR ---
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

    // ============================================================
    // STEP 4: Send email if we have attachments and an email
    // ============================================================
    if (attachments.length > 0 && email) {
      const emailBody = plan.customEmailBody
        ? '<p>' + plan.customEmailBody.split('\n').join('<br>') + '</p>'
        : '<p>Hi,</p><p>Please find attached documents as requested.</p>'

      await sendEmail({
        to: email,
        subject: results.join(' + ') + ' - Tested Electrical',
        body: buildEmailHTML(emailBody + '<p>Nathan<br>' + BUSINESS.phone + '<br>' + BUSINESS.name + '</p>'),
        attachments
      })
      await reply(from, results.join(', ') + ' sent to ' + email)
    } else if (attachments.length > 0 && !email) {
      await reply(from, results.join(', ') + ' generated but no email on file. Reply with the email to send.')
    } else if (results.length > 0) {
      await reply(from, results.join(', ') + ' done.')
    } else {
      await reply(from, plan.reply || 'Got it! Check the dashboard.')
    }

    // Update job status if completing
    if (actions.includes('generate_report') && jobRef) {
      await query("UPDATE jobs SET status='completed', completed_date=$1, updated_at=NOW() WHERE id=$2", [new Date(), jobRef.id])
    }

    return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
  } catch (error: any) {
    console.error('SMS webhook error:', error)
    try { await sendSMS(from, 'Something went wrong. Check the dashboard.') } catch {}
    return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
  }
}
