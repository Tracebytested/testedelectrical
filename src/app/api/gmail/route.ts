import { NextRequest, NextResponse } from 'next/server'
import { getUnreadEmails, getAttachment, markAsRead, sendEmail, buildEmailHTML } from '@/lib/gmail'
import { extractWorkOrderFromEmail, generateEmailReply } from '@/lib/ai'
import { extractPDFText, findOrCreateClient, getNextJobNumber } from '@/lib/utils'
import { sendNathanSMS, formatJobAlert } from '@/lib/sms'
import { query } from '@/lib/db'

// Keywords that strongly suggest a real work order
const WORK_ORDER_KEYWORDS = [
  'work order', 'workorder', 'job order', 'job request',
  'maintenance request', 'repair request', 'service request',
  'please attend', 'please complete', 'please carry out',
  'assigned to carry out', 'assigned to attend', 'assigned to complete',
  'electrical work', 'electrical inspection', 'smoke alarm',
  'safety check', 'fault', 'urgent repair', 'emergency repair',
  'tenant request', 'property maintenance', 'please find attached work',
  'please find attached job', 'new job', 'new work', 'attend site',
  'attend the property', 'carry out', 'scope of works',
  'quote required', 'quotation required', 'please quote'
]

// Keywords that mean we should definitely skip this email
const SKIP_KEYWORDS = [
  'unsubscribe', 'newsletter', 'marketing', 'noreply@',
  'no-reply@', 'donotreply@', 'notification@', 'notify@',
  'hello@notify', 'team@', 'support@', 'invoice+statements',
  'store-news@', 'news@marketing', 'employer satisfaction',
  'apprenticeships modernisation', 'invite.ics', 'calendar invite',
  'google calendar', 'you have been invited'
]

function isWorkOrderEmail(subject: string, body: string, from: string): boolean {
  const combined = (subject + ' ' + body + ' ' + from).toLowerCase()

  // Hard skip — definitely not a work order
  for (const skip of SKIP_KEYWORDS) {
    if (combined.includes(skip)) return false
  }

  // Must contain at least one work order keyword
  for (const keyword of WORK_ORDER_KEYWORDS) {
    if (combined.includes(keyword)) return true
  }

  // Also check subject line specifically for address patterns (e.g. "Unit 1/7 Spicer Blvd")
  const hasAddress = /\d+[\/\-]\d+|\d+\s+[A-Z][a-z]+\s+(St|Street|Rd|Road|Ave|Avenue|Blvd|Drive|Dr|Ct|Court|Way|Cres|Crescent)/i.test(subject)
  const hasJobRef = /\#\d{3,}|WO[\-\s]?\d+|JO[\-\s]?\d+/i.test(subject + body)

  return hasAddress || hasJobRef
}

export async function POST(req: NextRequest) {
  try {
    const emails = await getUnreadEmails()
    const processed = []
    const skipped = []

    for (const email of emails) {
      // Skip if already processed
      const exists = await query(
        'SELECT id FROM emails WHERE gmail_message_id = $1',
        [email.id]
      )
      if (exists.rows.length > 0) continue

      // Check if this looks like a work order
      if (!isWorkOrderEmail(email.subject, email.body, email.from)) {
        // Mark as read but don't process
        await markAsRead(email.id)
        skipped.push(email.subject)
        continue
      }

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

      // Build a sensible title fallback
      const jobTitle = workOrder.job_title
        || email.subject
        || `${workOrder.client || 'Client'} — Work Order`

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
          jobTitle,
          workOrder.description || email.snippet || '',
          workOrder.site_address || '',
          workOrder.work_order_ref || '',
          workOrder.contact_name || ''
        ]
      )
      const jobId = jobResult.rows[0].id

      // Log email
      await query(
        `INSERT INTO emails (gmail_message_id, from_address, from_name, subject, body, received_at, processed, job_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), true, $6)`,
        [email.id, email.from, workOrder.contact_name || '', email.subject, email.body, jobId]
      )

      // Mark email as read
      await markAsRead(email.id)

      // Send Nathan an SMS alert
      try {
        await sendNathanSMS(formatJobAlert({
          job_number: jobNumber,
          title: jobTitle,
          client: workOrder.client || email.from,
          site_address: workOrder.site_address || 'See email',
          work_order_ref: workOrder.work_order_ref
        }))
      } catch (smsErr) {
        console.error('SMS failed:', smsErr)
      }

      // Auto-acknowledge email to agency
      if (workOrder.contact_email) {
        try {
          const replyBody = await generateEmailReply({
            originalEmail: email.body,
            purpose: 'acknowledge_work_order',
            clientName: workOrder.client || 'Team',
            jobTitle
          })
          await sendEmail({
            to: workOrder.contact_email,
            subject: `RE: ${email.subject}`,
            body: buildEmailHTML(`<p>${replyBody.replace(/\n/g, '</p><p>')}</p>`)
          })
        } catch (emailErr) {
          console.error('Reply email failed:', emailErr)
        }
      }

      processed.push({ jobNumber, title: jobTitle, client: workOrder.client })
    }

    return NextResponse.json({
      success: true,
      processed,
      skipped: skipped.length,
      skipped_subjects: skipped
    })
  } catch (error: any) {
    console.error('Gmail poll error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Use POST to poll Gmail' })
}
