import { NextRequest, NextResponse } from 'next/server'
import { processJobUpdateSMS, generateReportFromDescription, processCreateWorkOrderSMS } from '@/lib/ai'
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

const AUTHORISED_NUMBERS = [
  '+61407180596',
  '+61429604291',
]

async function replyTo(from: string, message: string) {
  await sendSMS(from, message)
}

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

function detectIntent(text: string): 'complete' | 'create' | 'unknown' {
  const lower = text.toLowerCase()
  for (const kw of COMPLETE_KEYWORDS) {
    if (lower.includes(kw)) return 'complete'
  }
  for (const kw of CREATE_KEYWORDS) {
    if (lower.includes(kw)) return 'create'
  }
  return 'unknown'
}

// Extract email address from SMS text
function extractEmail(text: string): string | null {
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
  return match ? match[0] : null
}

// Extract price from SMS text
function extractPrice(text: string): number {
  const match = text.match(/\$(\d+(?:\.\d{2})?)/)
  return match ? parseFloat(match[1]) : 0
}

// Find job by address keywords or job number
async function findJob(body: string): Promise<any | null> {
  // Try job number first
  const jobRefMatch = body.match(/([JW]O?[-#]?\d{3,6})/i)
  if (jobRefMatch) {
    const ref = jobRefMatch[1]
    const result = await query(
      `SELECT j.*, c.name as client_name, c.email as client_email, c.company, j.agency_contact
       FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
       WHERE j.job_number ILIKE $1 OR j.work_order_ref ILIKE $1 LIMIT 1`,
      [`%${ref}%`]
    )
    if (result.rows.length > 0) return result.rows[0]
  }

  // Try to find by address — extract street number + name from message
  const addressMatch = body.match(/(\d+\s+[A-Za-z]+\s+(?:st|street|rd|road|ave|avenue|blvd|drive|dr|ct|court|way|cres|crescent|pl|place)[,\s])/i)
  if (addressMatch) {
    const addressFragment = addressMatch[1].trim().replace(/,$/, '')
    const result = await query(
      `SELECT j.*, c.name as client_name, c.email as client_email, c.company, j.agency_contact
       FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
       WHERE j.site_address ILIKE $1
       AND j.status IN ('pending', 'active')
       ORDER BY j.created_at DESC LIMIT 1`,
      [`%${addressFragment}%`]
    )
    if (result.rows.length > 0) return result.rows[0]
  }

  // Fall back to most recent active/pending job
  const result = await query(
    `SELECT j.*, c.name as client_name, c.email as client_email, c.company, j.agency_contact
     FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
     WHERE j.status IN ('pending', 'active')
     ORDER BY j.created_at DESC LIMIT 1`
  )
  return result.rows.length > 0 ? result.rows[0] : null
}

async function generateAndSendReportInvoice(job: any, body: string, from: string) {
  const reportData = await generateReportFromDescription({
    nathanDescription: body,
    jobTitle: job.title,
    client: job.client_name,
    siteAddress: job.site_address,
    workOrderRef: job.work_order_ref
  })

  // Extract price from message, override AI if found
  const smsPrice = extractPrice(body)
  if (smsPrice > 0) reportData.price_ex_gst = smsPrice

  // Extract email from message — overrides what's on file
  const smsEmail = extractEmail(body)
  const clientEmail = smsEmail || job.client_email

  const reportNumber = await getNextReportNumber()
  const today = new Date()

  await query(
    `INSERT INTO reports (report_number, job_id, client_id, title, task_information,
     investigation_findings, work_undertaken, remedial_action, recommended_followup,
     price_ex_gst, conducted_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')`,
    [reportNumber, job.id, job.client_id, reportData.title, reportData.task_information,
     reportData.investigation_findings, reportData.work_undertaken, reportData.remedial_action,
     reportData.recommended_followup, reportData.price_ex_gst, today]
  )

  const reportPDF = await generateReportPDF({
    report_number: reportNumber, conducted_on: formatDateLong(today),
    title: reportData.title, status: 'Completed',
    site_location: job.site_address, work_order: job.work_order_ref || job.job_number,
    client: job.client_name, contact: job.agency_contact || '',
    date_completed: formatDate(today),
    task_information: reportData.task_information,
    investigation_findings: reportData.investigation_findings,
    work_undertaken: reportData.work_undertaken,
    remedial_action: reportData.remedial_action,
    recommended_followup: reportData.recommended_followup,
    price_ex_gst: reportData.price_ex_gst
  })

  const invoiceNumber = await getNextInvoiceNumber()
  const lineItems = reportData.price_ex_gst > 0
    ? [{ description: reportData.title, qty: 1, rate: reportData.price_ex_gst }]
    : [{ description: job.title, qty: 1, rate: 0 }]
  const { lineItems: calcItems, subtotal, gst, total } = calculateLineItems(lineItems)

  await query(
    `INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8)`,
    [invoiceNumber, job.id, job.client_id, JSON.stringify(calcItems), subtotal, gst, total,
     new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
  )

  const invoicePDF = await generateInvoicePDF({
    invoice_number: invoiceNumber, date: formatDate(today),
    bill_to_name: job.client_name, bill_to_address: job.site_address,
    line_items: calcItems, subtotal, gst, total
  })

  await query("UPDATE jobs SET status='completed', completed_date=$1, updated_at=NOW() WHERE id=$2", [today, job.id])

  if (clientEmail) {
    // Update client email if provided in SMS
    if (smsEmail && smsEmail !== job.client_email) {
      await query("UPDATE clients SET email=$1 WHERE id=$2", [smsEmail, job.client_id])
    }

    await sendEmail({
      to: clientEmail,
      subject: `Service Report & Invoice - ${reportData.title} - ${reportNumber}`,
      body: buildEmailHTML(`
        <p>Hi ${job.agency_contact || job.client_name},</p>
        <p>Please find attached the completed service report and invoice for the following works:</p>
        <p><strong>${reportData.title}</strong><br>
        Site: ${job.site_address}<br>
        ${job.work_order_ref ? `Work Order: ${job.work_order_ref}<br>` : ''}
        Report: ${reportNumber} | Invoice: ${invoiceNumber}</p>
        <p>Total: $${total.toFixed(2)} inc GST — due within ${BUSINESS.payment_terms_days} days.</p>
        <p>Nathan<br>${BUSINESS.phone}<br>${BUSINESS.name}</p>
      `),
      attachments: [
        { filename: `${reportNumber}_Service_Report.pdf`, content: reportPDF, contentType: 'application/pdf' },
        { filename: `Invoice_${invoiceNumber}.pdf`, content: invoicePDF, contentType: 'application/pdf' }
      ]
    })

    await query("UPDATE reports SET status='sent', sent_at=NOW() WHERE report_number=$1", [reportNumber])
    await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invoiceNumber])
    await replyTo(from, `✅ Done!\nReport: ${reportNumber}\nInvoice: ${invoiceNumber} ($${total.toFixed(2)} inc GST)\nSent to: ${clientEmail}`)
  } else {
    await replyTo(from, `✅ Report ${reportNumber} + Invoice ${invoiceNumber} ($${total.toFixed(2)}) saved.\n⚠️ No email — reply with the client's email to send.`)
  }
}

export async function POST(req: NextRequest) {
  let from = '+61407180596'
  try {
    const formData = await req.formData()
    const body = formData.get('Body') as string
    from = formData.get('From') as string

    if (!AUTHORISED_NUMBERS.includes(from)) {
      return new NextResponse('<?xml version="1.0"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    await query(
      'INSERT INTO sms_log (direction, from_number, to_number, body) VALUES ($1, $2, $3, $4)',
      ['inbound', from, process.env.TWILIO_PHONE_NUMBER, body]
    )

    const intent = detectIntent(body)

    // CREATE intent
    if (intent === 'create') {
      const workOrderData = await processCreateWorkOrderSMS(body)
      if (workOrderData) {
        const clientId = await findOrCreateClient({ name: workOrderData.client, is_agency: false })
        const jobNumber = await getNextJobNumber()
        await query(
          `INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source)
           VALUES ($1, $2, $3, $4, $5, 'pending', 'sms')`,
          [jobNumber, clientId, workOrderData.title, workOrderData.description, workOrderData.site_address]
        )
        await replyTo(from, `✅ Work order ${jobNumber} created!\n"${workOrderData.title}"\nClient: ${workOrderData.client}\nSite: ${workOrderData.site_address}`)
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      }
    }

    // COMPLETE intent — find job and generate report + invoice
    if (intent === 'complete') {
      const job = await findJob(body)
      if (job) {
        await replyTo(from, `Got it! Writing report + invoice for "${job.title}" at ${job.site_address}... 30 secs ⚡`)
        await generateAndSendReportInvoice(job, body, from)
      } else {
        await replyTo(from, `Hey, couldn't find a matching job. Include the address or job number and try again.`)
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // UNKNOWN — let AI decide
    const job = await findJob(body)
    const aiResponse = await processJobUpdateSMS(body, job ? {
      title: job.title, client: job.client_name,
      site: job.site_address, workOrderRef: job.work_order_ref
    } : undefined)

    if (aiResponse.action === 'generate_report' && job) {
      await replyTo(from, `Got it! Writing report + invoice for "${job.title}"... 30 secs ⚡`)
      await generateAndSendReportInvoice(job, body, from)
    } else {
      await replyTo(from, aiResponse.response || "Got it! Check the dashboard.")
    }

    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    })
  } catch (error: any) {
    console.error('SMS webhook error:', error)
    try { await sendSMS(from, '⚠️ Something went wrong. Check the dashboard.') } catch {}
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}
