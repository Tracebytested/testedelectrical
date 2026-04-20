import { NextRequest, NextResponse } from 'next/server'
import { getUnreadEmails, getAttachment, markAsRead, sendEmail, buildEmailHTML } from '@/lib/gmail'
import { extractWorkOrderFromEmail, generateEmailReply } from '@/lib/ai'
import { extractPDFText, findOrCreateClient, getNextJobNumber } from '@/lib/utils'
import { sendNathanSMS, formatJobAlert } from '@/lib/sms'
import { query } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const emails = await getUnreadEmails()
    const processed = []

    for (const email of emails) {
      // Skip if already processed
      const exists = await query(
        'SELECT id FROM emails WHERE gmail_message_id = $1',
        [email.id]
      )
      if (exists.rows.length > 0) continue

      // Try to get PDF attachment text
      let pdfText = ''
      for (const att of email.attachments) {
        if (att.mimeType === 'application/pdf') {
          const buffer = await getAttachment(email.id, att.attachmentId)
          pdfText = await extractPDFText(buffer)
          break
        }
      }

      // Use AI to extract work order info
      const workOrder = await extractWorkOrderFromEmail(email.body, pdfText || undefined)

      // Find or create client
      const clientId = await findOrCreateClient({
        name: workOrder.client || email.from,
        email: workOrder.contact_email,
        company: workOrder.agency,
        is_agency: true
      })

      // Create job
      const jobNumber = await getNextJobNumber()
      const jobResult = await query(
        `INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source, work_order_ref, agency_contact)
         VALUES ($1, $2, $3, $4, $5, 'pending', 'email', $6, $7) RETURNING id`,
        [
          jobNumber,
          clientId,
          workOrder.job_title,
          workOrder.description,
          workOrder.site_address,
          workOrder.work_order_ref,
          workOrder.contact_name
        ]
      )
      const jobId = jobResult.rows[0].id

      // Log email
      await query(
        `INSERT INTO emails (gmail_message_id, from_address, from_name, subject, body, received_at, processed, job_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), true, $6)`,
        [email.id, email.from, workOrder.contact_name, email.subject, email.body, jobId]
      )

      // Mark email as read
      await markAsRead(email.id)

      // Send Nathan an SMS alert
      await sendNathanSMS(formatJobAlert({
        job_number: jobNumber,
        title: workOrder.job_title,
        client: workOrder.client,
        site_address: workOrder.site_address,
        work_order_ref: workOrder.work_order_ref
      }))

      // Auto-acknowledge email to agency
      if (workOrder.contact_email) {
        const replyBody = await generateEmailReply({
          originalEmail: email.body,
          purpose: 'acknowledge_work_order',
          clientName: workOrder.client,
          jobTitle: workOrder.job_title
        })

        await sendEmail({
          to: workOrder.contact_email,
          subject: `RE: ${email.subject}`,
          body: buildEmailHTML(`<p>${replyBody.replace(/\n/g, '</p><p>')}</p>`)
        })
      }

      processed.push({ jobNumber, title: workOrder.job_title, client: workOrder.client })
    }

    return NextResponse.json({ success: true, processed })
  } catch (error: any) {
    console.error('Gmail poll error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  // Manual trigger check
  return NextResponse.json({ message: 'Use POST to poll Gmail' })
}
