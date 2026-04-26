import { NextRequest, NextResponse } from 'next/server'
import { getUnreadEmails, getAttachment, markAsRead, sendEmail, buildEmailHTML } from '@/lib/gmail'
import { extractWorkOrderFromEmail, generateEmailReply } from '@/lib/ai'
import { extractPDFText, findOrCreateClient, getNextJobNumber } from '@/lib/utils'
import { sendNathanSMS, formatJobAlert } from '@/lib/sms'
import { query } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BLOCKED_SENDERS = [
  'esv', 'energysafe', 'esvconnect', 'checkhero',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'notify.railway', 'hello@notify', 'team.twilio',
  'twilio.com', 'railway.app', 'anthropic.com',
  'amazon.com', 'costco', 'marketing', 'newsletter',
  'xero.com', 'myob.com', 'intuit.com'
]

const BLOCKED_PATTERNS = [
  'certificate of electrical safety', 'certificate of compliance',
  'coes ', 'electrical safety certificate', 'your certificate',
  'compliance certificate', 'google calendar', 'calendar invite',
  'you have been invited', 'invite.ics', 'unsubscribe',
  'view in browser', 'account statement', 'your invoice from',
  'payment received', 'payment confirmation', 'your receipt',
  'order confirmation', 'your order', 'survey', 'feedback request'
]

const WORK_ORDER_SIGNALS = [
  'work order', 'workorder', 'job order', 'maintenance request',
  'repair request', 'service request', 'please attend', 'please complete',
  'please carry out', 'assigned to carry out', 'assigned to attend',
  'please find attached work', 'attend site', 'attend the property',
  'scope of works', 'new job', 'quote required', 'quotation required',
  'please quote', 'electrical work required', 'fault', 'urgent repair',
  'smoke alarm check', 'safety check required', 'inspection required',
  'tenant request', 'property maintenance', 'routine maintenance'
]

function shouldSkipEmail(subject: string, body: string, from: string): boolean {
  const combined = (subject + ' ' + body + ' ' + from).toLowerCase()
  for (const blocked of BLOCKED_SENDERS) {
    if (from.toLowerCase().includes(blocked)) return true
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (combined.includes(pattern)) return true
  }
  const hasSignal = WORK_ORDER_SIGNALS.some(s => combined.includes(s))
  const hasAddress = /\d+[\/\-]\d+|\d+\s+[A-Z][a-z]+\s+(St|Street|Rd|Road|Ave|Avenue|Blvd|Drive|Dr|Ct|Court|Way)/i.test(subject)
  const hasJobRef = /\#\d{3,}|WO[\-\s]?\d+|JO[\-\s]?\d+/i.test(subject + ' ' + body)
  const hasWorkOrderSubject = /work order|workorder|job order|new job/i.test(subject)
  return !hasSignal && !hasAddress && !hasJobRef && !hasWorkOrderSubject
}

async function aiConfirmWorkOrder(subject: string, body: string, from: string): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Is this email a genuine request for electrical work or a work order? Answer YES or NO only.\n\nFrom: ${from}\nSubject: ${subject}\nBody: ${body.substring(0, 400)}`
      }]
    })
    const answer = response.content[0].type === 'text' ? response.content[0].text.trim().toUpperCase() : 'NO'
    return answer.startsWith('YES')
  } catch {
    return false
  }
}

async function processEmails() {
  const emails = await getUnreadEmails()
  const processed = []
  const skipped = []

  for (const email of emails) {
    const exists = await query('SELECT id FROM emails WHERE gmail_message_id = $1', [email.id])
    if (exists.rows.length > 0) continue

    if (shouldSkipEmail(email.subject, email.body, email.from)) {
      await markAsRead(email.id)
      skipped.push(email.subject)
      continue
    }

    const isWorkOrder = await aiConfirmWorkOrder(email.subject, email.body, email.from)
    if (!isWorkOrder) {
      await markAsRead(email.id)
      skipped.push(`${email.subject} (AI rejected)`)
      continue
    }

    let pdfText = ''
    for (const att of email.attachments) {
      if (att.mimeType === 'application/pdf') {
        const buffer = await getAttachment(email.id, att.attachmentId)
        pdfText = await extractPDFText(buffer)
        break
      }
    }

    const workOrder = await extractWorkOrderFromEmail(email.body, pdfText || undefined)
    const jobTitle = workOrder.job_title || email.subject || `${workOrder.client || 'Client'} — Work Order`

    const clientId = await findOrCreateClient({
      name: workOrder.client || email.from,
      email: workOrder.contact_email,
      company: workOrder.agency,
      is_agency: true
    })

    const jobNumber = await getNextJobNumber()
    const jobResult = await query(
      `INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source, work_order_ref, agency_contact)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'email', $6, $7) RETURNING id`,
      [jobNumber, clientId, jobTitle, workOrder.description || '', workOrder.site_address || '', workOrder.work_order_ref || '', workOrder.contact_name || '']
    )
    const jobId = jobResult.rows[0].id

    await query(
      `INSERT INTO emails (gmail_message_id, from_address, from_name, subject, body, received_at, processed, job_id)
       VALUES ($1, $2, $3, $4, $5, NOW(), true, $6)`,
      [email.id, email.from, workOrder.contact_name || '', email.subject, email.body, jobId]
    )

    await markAsRead(email.id)

    try {
      await sendNathanSMS(formatJobAlert({
        job_number: jobNumber, title: jobTitle,
        client: workOrder.client || email.from,
        site_address: workOrder.site_address || 'See email',
        work_order_ref: workOrder.work_order_ref
      }))
    } catch (e) { console.error('SMS error:', e) }

    // Auto-acknowledge disabled

    processed.push({ jobNumber, title: jobTitle, client: workOrder.client })
  }

  return { processed, skipped: skipped.length }
}

export async function GET(req: NextRequest) {
  try {
    const result = await processEmails()
    console.log('Cron email check:', result)
    return NextResponse.json({ success: true, time: new Date().toISOString(), ...result })
  } catch (error: any) {
    console.error('Cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
