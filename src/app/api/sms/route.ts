import { NextRequest, NextResponse } from 'next/server'
import { processJobUpdateSMS, generateReportFromDescription } from '@/lib/ai'
import { sendNathanSMS } from '@/lib/sms'
import { generateReportPDF, generateInvoicePDF } from '@/lib/pdf'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { query } from '@/lib/db'
import {
  getNextReportNumber,
  getNextInvoiceNumber,
  calculateLineItems,
  formatDate,
  formatDateLong
} from '@/lib/utils'
import { BUSINESS } from '@/lib/constants'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const body = formData.get('Body') as string
    const from = formData.get('From') as string

    // Only accept SMS from Nathan
    if (from !== BUSINESS.phone_e164) {
      return new NextResponse('<?xml version="1.0"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // Log inbound SMS
    await query(
      'INSERT INTO sms_log (direction, from_number, to_number, body) VALUES ($1, $2, $3, $4)',
      ['inbound', from, process.env.TWILIO_PHONE_NUMBER, body]
    )

    // Try to find referenced job
    const jobRefMatch = body.match(/([JW]O?[-#]?\d{3,6})/i)
    let job = null
    let jobId = null

    if (jobRefMatch) {
      const ref = jobRefMatch[1]
      const jobResult = await query(
        `SELECT j.*, c.name as client_name, c.email as client_email, c.contact as agency_contact
         FROM jobs j
         LEFT JOIN clients c ON j.client_id = c.id
         WHERE j.job_number ILIKE $1 OR j.work_order_ref ILIKE $1
         LIMIT 1`,
        [`%${ref}%`]
      )
      if (jobResult.rows.length > 0) {
        job = jobResult.rows[0]
        jobId = job.id
      }
    }

    // If no job ref, get the most recent active job
    if (!job) {
      const recentJob = await query(
        `SELECT j.*, c.name as client_name, c.email as client_email
         FROM jobs j
         LEFT JOIN clients c ON j.client_id = c.id
         WHERE j.status IN ('pending', 'active')
         ORDER BY j.created_at DESC LIMIT 1`
      )
      if (recentJob.rows.length > 0) {
        job = recentJob.rows[0]
        jobId = job.id
      }
    }

    // Process the SMS with AI
    const aiResponse = await processJobUpdateSMS(body, job ? {
      title: job.title,
      client: job.client_name,
      site: job.site_address,
      workOrderRef: job.work_order_ref
    } : undefined)

    if (aiResponse.action === 'generate_report' && job) {
      // Generate the full report
      const reportData = await generateReportFromDescription({
        nathanDescription: body,
        jobTitle: job.title,
        client: job.client_name,
        siteAddress: job.site_address,
        workOrderRef: job.work_order_ref
      })

      const reportNumber = await getNextReportNumber()
      const today = new Date()

      // Save report to DB
      await query(
        `INSERT INTO reports (report_number, job_id, client_id, title, task_information,
         investigation_findings, work_undertaken, remedial_action, recommended_followup,
         price_ex_gst, conducted_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')`,
        [
          reportNumber, jobId, job.client_id, reportData.title,
          reportData.task_information, reportData.investigation_findings,
          reportData.work_undertaken, reportData.remedial_action,
          reportData.recommended_followup, reportData.price_ex_gst,
          today
        ]
      )

      // Generate report PDF
      const reportPDF = await generateReportPDF({
        report_number: reportNumber,
        conducted_on: formatDateLong(today),
        title: reportData.title,
        status: 'Completed',
        site_location: job.site_address,
        work_order: job.work_order_ref || job.job_number,
        client: job.client_name,
        contact: job.agency_contact || '',
        date_completed: formatDate(today),
        task_information: reportData.task_information,
        investigation_findings: reportData.investigation_findings,
        work_undertaken: reportData.work_undertaken,
        remedial_action: reportData.remedial_action,
        recommended_followup: reportData.recommended_followup,
        price_ex_gst: reportData.price_ex_gst
      })

      // Generate invoice
      const invoiceNumber = await getNextInvoiceNumber()
      const lineItems = reportData.price_ex_gst > 0
        ? [{ description: reportData.title, qty: 1, rate: reportData.price_ex_gst }]
        : [{ description: job.title, qty: 1, rate: 0 }]

      const { lineItems: calcItems, subtotal, gst, total } = calculateLineItems(lineItems)

      await query(
        `INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)`,
        [
          invoiceNumber, jobId, job.client_id,
          JSON.stringify(calcItems), subtotal, gst, total,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        ]
      )

      const invoicePDF = await generateInvoicePDF({
        invoice_number: invoiceNumber,
        date: formatDate(today),
        bill_to_name: job.client_name,
        bill_to_address: job.site_address,
        line_items: calcItems,
        subtotal,
        gst,
        total
      })

      // Update job status
      await query(
        "UPDATE jobs SET status = 'completed', completed_date = $1, updated_at = NOW() WHERE id = $2",
        [today, jobId]
      )

      // Send report + invoice to client/agency
      if (job.client_email) {
        const emailBody = buildEmailHTML(`
          <p>Hi ${job.agency_contact || job.client_name},</p>
          <p>Please find attached the completed service report and invoice for the following job:</p>
          <p><strong>${reportData.title}</strong><br>
          Site: ${job.site_address}<br>
          Work Order: ${job.work_order_ref || job.job_number}</p>
          <p>Please don't hesitate to contact us if you have any questions.</p>
          <p>Nathan<br>${BUSINESS.phone}<br>${BUSINESS.name}</p>
        `)

        await sendEmail({
          to: job.client_email,
          subject: `Service Report & Invoice — ${reportData.title} — ${reportNumber}`,
          body: emailBody,
          attachments: [
            {
              filename: `${reportNumber}_Service_Report.pdf`,
              content: reportPDF,
              contentType: 'application/pdf'
            },
            {
              filename: `Invoice_${invoiceNumber}.pdf`,
              content: invoicePDF,
              contentType: 'application/pdf'
            }
          ]
        })

        await query(
          "UPDATE reports SET status = 'sent', sent_at = NOW() WHERE report_number = $1",
          [reportNumber]
        )
        await query(
          "UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE invoice_number = $1",
          [invoiceNumber]
        )
      }

      // Reply to Nathan
      const clientEmail = job.client_email
      await sendNathanSMS(
        `✅ Done! Report ${reportNumber} + Invoice ${invoiceNumber} ($${total.toFixed(2)}) ${clientEmail ? `sent to ${job.client_email}` : 'saved as draft (no email on file)'}.`
      )

    } else {
      // Just reply with AI response
      await sendNathanSMS(aiResponse.response || "Got it! Check the dashboard for details.")
    }

    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    })
  } catch (error: any) {
    console.error('SMS webhook error:', error)
    await sendNathanSMS('⚠️ Something went wrong processing your message. Check the dashboard.')
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}
