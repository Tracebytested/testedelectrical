import { NextRequest, NextResponse } from 'next/server'
import { getUnreadEmails, getAttachment, markAsRead, sendEmail, buildEmailHTML } from '@/lib/gmail'
import { extractWorkOrderFromEmail, generateEmailReply } from '@/lib/ai'
import { extractPDFText, findOrCreateClient, getNextJobNumber } from '@/lib/utils'
import { sendNathanSMS, formatJobAlert } from '@/lib/sms'
import { query } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Senders/domains to always ignore
const BLOCKED_SENDERS = [
  'esv', 'energysafe', 'esvconnect', 'checkhero',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'notify.railway', 'hello@notify', 'team.twilio',
  'twilio.com', 'railway.app', 'anthropic.com',
  'amazon.com', 'costco', 'marketing',
  'newsletter', 'unsubscribe', 'mailchimp',
  'employer satisfaction', 'apprenticeships',
  'worksafe', 'safework', 'fairwork',
  'xero.com', 'myob.com', 'intuit.com'
]

// Subject/body patterns to always ignore  
const BLOCKED_PATTERNS = [
  'certificate of electrical safety',
  'certificate of compliance',
  'coes ', 'n504', // ESV cert numbers
  'electrical safety certificate',
  'your certificate',
  'compliance certificate',
  'google calendar',
  'calendar invite',
  'you have been invited',
  'invite.ics',
  'unsubscribe',
  'view in browser',
  'privacy policy',
  'terms and conditions',
  'account statement',
  'your invoice from',
  'payment received',
  'payment confirmation',
  'your receipt',
  'order confirmation',
  'your order',
  'survey',
  'feedback request'
]

// Must contain at least one of these to be considered a work order
const WORK_ORDER_SIGNALS = [
  'work order', 'workorder', 'job order',
  'maintenance request', 'repair request', 'service request',
  'please attend', 'please complete', 'please carry out',
  'assigned to carry out', 'assigned to attend',
  'please find attached work', 'please find attached job',
  'attend site', 'attend the property',
  'scope of works', 'new job', 'new task',
  'quote required', 'quotation required', 'please quote',
  'electrical work required', 'fault', 'urgent repair',
  'smoke alarm check', 'safety check required',
  'inspection required', 'please inspect',
  'tenant request', 'landlord request',
  'property maintenance', 'routine maintenance'
]

function shouldSkipEmail(subject: string, body: string, from: string): { skip: boolean; reason: string } {
  const combined = (subject + ' ' + body + ' ' + from).toLowerCase()
  const fromLower = from.toLowerCase()
  const subjectLower = subject.toLowerCase()

  // Check blocked senders
  for (const blocked of BLOCKED_SENDERS) {
    if (fromLower.includes(blocked)) {
      return { skip: true, reason: `Blocked sender: ${blocked}` }
    }
  }

  // Check blocked patterns in subject/body
  for (const pattern of BLOCKED_PATTERNS) {
    if (combined.includes(pattern)) {
      return { skip: true, reason: `Blocked pattern: ${pattern}` }
    }
  }

  // Must have at least one work order signal
  const hasSignal = WORK_ORDER_SIGNALS.some(signal => combined.includes(signal))
  
  // Also accept if subject has address + job ref pattern
  const hasAddressInSubject = /\d+[\/\-]\d+|\d+\s+[A-Z][a-z]+\s+(St|Street|Rd|Road|Ave|Avenue|Blvd|Drive|Dr|Ct|Court|Way|Cres|Crescent)/i.test(subject)
  const hasJobRef = /\#\d{3,}|WO[\-\s]?\d+|JO[\-\s]?\d+/i.test(subject + ' ' + body)
  const hasWorkOrderInSubject = /work order|workorder|job order|new job/i.test(subjectLower)

  if (!hasSignal && !hasAddressInSubject && !hasJobRef && !hasWorkOrderInSubject) {
    return { skip: true, reason: 'No work order signals found' }
  }

  return { skip: false, reason: '' }
}

// Final AI check — is this actually a work order requesting electrical work?
async function aiConfirmWorkOrder(subject: string, body: string, from: string): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `You are filtering emails for an electrical contractor. Is this email asking for electrical work to be done, or is it a work order/job request? Answer only YES or NO.

From: ${from}
Subject: ${subject}
Body (first 500 chars): ${body.substring(0, 500)}

Is this a genuine request for electrical work or a work order? YES or NO only.`
      }]
    })
    const answer = response.content[0].type === 'text' ? response.content[0].text.trim().toUpperCase() : 'NO'
    return answer.startsWith('YES')
  } catch {
    return false
  }
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

      // First pass — rule-based filter
      const { skip, reason } = shouldSkipEmail(email.subject, email.body, email.from)
      if (skip) {
        await markAsRead(email.id)
        skipped.push(`${email.subject} (${reason})`)
        continue
      }

      // Second pass — AI confirmation
      const isWorkOrder = await aiConfirmWorkOrder(email.subject, email.body, email.from)
      if (!isWorkOrder) {
        await markAsRead(email.id)
        skipped.push(`${email.subject} (AI: not a work order)`)
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

      // Build a sensible title with multiple fallbacks
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
          workOrder.description || '',
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

      await markAsRead(email.id)

      // SMS Nathan
      try {
        await sendNathanSMS(formatJobAlert({
          job_number: jobNumber,
          title: jobTitle,
          client: workOrder.client || email.from,
          site_address: workOrder.site_address || 'See email',
          work_order_ref: workOrder.work_order_ref
        }))
      } catch (e) { console.error('SMS error:', e) }

      // Auto-acknowledge disabled - was causing issues with agencies

      processed.push({ jobNumber, title: jobTitle, client: workOrder.client })
    }

    return NextResponse.json({ success: true, processed, skipped: skipped.length, skipped_subjects: skipped })
  } catch (error: any) {
    console.error('Gmail poll error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Use POST to poll Gmail' })
}
