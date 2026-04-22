import Anthropic from '@anthropic-ai/sdk'
import { BUSINESS, AGENT } from './constants'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const BEEZY_SYSTEM = `${AGENT.personality}

Business: ${BUSINESS.name} | ABN: ${BUSINESS.abn} | REC: ${BUSINESS.rec} | Licence: ${BUSINESS.licence}
Technician: ${BUSINESS.technician} | Phone: ${BUSINESS.phone} | Email: ${BUSINESS.email}`

export async function extractWorkOrderFromEmail(emailText: string, pdfText?: string): Promise<{
  client: string
  contact_name?: string
  contact_email?: string
  site_address: string
  job_title: string
  description: string
  work_order_ref?: string
  agency?: string
  urgency?: string
}> {
  const content = pdfText
    ? `Email content:\n${emailText}\n\nAttached PDF content:\n${pdfText}`
    : emailText

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are an admin assistant for ${BUSINESS.name}, an electrical contractor in Victoria, Australia.

Extract work order information from the following email/document and return ONLY a JSON object with these fields:
- client (company name or person sending the work order)
- contact_name (person to contact at site or agency)
- contact_email (email to reply to)
- site_address (full address where work is needed)
- job_title (brief title of the job, max 80 chars)
- description (full description of work required)
- work_order_ref (work order or reference number if provided)
- agency (agency or company name)
- urgency (urgent/normal/scheduled if mentioned)

Return ONLY valid JSON, no other text.

Content to extract from:
${content}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {
      client: 'Unknown',
      site_address: 'See email',
      job_title: 'Work order received',
      description: emailText.substring(0, 500)
    }
  }
}

export async function generateReportFromDescription(input: {
  nathanDescription: string
  jobTitle: string
  client: string
  siteAddress: string
  workOrderRef?: string
}): Promise<{
  title: string
  task_information: string
  investigation_findings: string
  work_undertaken: string
  remedial_action: string
  recommended_followup: string
  price_ex_gst: number
}> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are ${AGENT.name}, admin assistant for ${BUSINESS.name}.

Nathan described a completed job. Write a professional service report.

Job: ${input.jobTitle}
Client: ${input.client}
Site: ${input.siteAddress}
Work order ref: ${input.workOrderRef || 'N/A'}

Nathan's description: "${input.nathanDescription}"

Return ONLY valid JSON:
- title (professional report title)
- task_information (formal scope, 1-2 sentences)
- investigation_findings (what was found, professional tone)
- work_undertaken (what was done, step by step, past tense)
- remedial_action (summary of rectification)
- recommended_followup (future recommendations or "No further action required")
- price_ex_gst (dollar amount if mentioned, otherwise 0)

Return ONLY valid JSON, no other text.`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {
      title: input.jobTitle,
      task_information: input.nathanDescription,
      investigation_findings: 'See technician notes.',
      work_undertaken: input.nathanDescription,
      remedial_action: 'Works completed as described.',
      recommended_followup: 'No further action required.',
      price_ex_gst: 0
    }
  }
}

export async function generateQuoteItems(jobDescription: string): Promise<Array<{
  description: string
  qty: number
  rate: number
}>> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are ${AGENT.name}, admin assistant for ${BUSINESS.name}, electrical contractor in Victoria, Australia.

Generate quote line items for this job. Use realistic 2025 Australian electrical contractor pricing.

Job: "${jobDescription}"

Standard rates:
- Call out fee: $160 inc GST
- Labour per hour: $120-150 ex GST
- Supply & install GPO: $180, light fitting: $150-250, switchboard work: $200-400/circuit

Return ONLY a JSON array:
- description (clear item description)
- qty (number)
- rate (ex GST dollars, number)

Max 6 items. Return ONLY valid JSON array.`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return [{ description: jobDescription, qty: 1, rate: 0 }]
  }
}

export async function generateEmailReply(context: {
  originalEmail: string
  purpose: 'acknowledge_work_order' | 'send_quote' | 'send_invoice' | 'send_report' | 'general'
  clientName: string
  jobTitle?: string
  additionalInfo?: string
}): Promise<string> {
  const purposes: Record<string, string> = {
    acknowledge_work_order: 'Acknowledge receipt of work order and confirm attendance',
    send_quote: 'Send a quote for the requested work',
    send_invoice: 'Send an invoice for completed work',
    send_report: 'Send a completed service report',
    general: 'Reply professionally to the email'
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Write a professional email body for ${BUSINESS.name}.

Purpose: ${purposes[context.purpose]}
Client: ${context.clientName}
${context.jobTitle ? `Job: ${context.jobTitle}` : ''}
${context.additionalInfo ? `Additional context: ${context.additionalInfo}` : ''}

Original email: ${context.originalEmail.substring(0, 500)}

Write brief professional email body only (no subject line needed).
Sign off: Nathan | ${BUSINESS.phone} | ${BUSINESS.name}
Australian business tone. Keep it concise.`
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

export async function processJobUpdateSMS(smsText: string, jobContext?: {
  title: string
  client: string
  site: string
  workOrderRef?: string
}): Promise<{
  action: 'generate_report' | 'update_job' | 'question' | 'unknown'
  response: string
  reportData?: any
}> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    system: BEEZY_SYSTEM,
    messages: [{
      role: 'user',
      content: `Nathan has sent an SMS. He may address you as Beezy.

${jobContext ? `Current job context:
- Title: ${jobContext.title}
- Client: ${jobContext.client}
- Site: ${jobContext.site}
- Work order: ${jobContext.workOrderRef || 'N/A'}` : 'No current job context.'}

Nathan's SMS: "${smsText}"

Determine what Nathan needs. Return ONLY valid JSON:
- action: "generate_report" (if describing completed work or asking to invoice/report), "update_job" (status update only), "question" (if asking something), "unknown"
- response: Brief SMS reply from Beezy to Nathan (max 160 chars, friendly and practical)
- summary: If generate_report, brief summary of what was done

Return ONLY valid JSON.`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {
      action: 'unknown',
      response: "Hey Nathan, got your message but couldn't process it automatically — check the dashboard."
    }
  }
}

export async function processCreateWorkOrderSMS(smsText: string): Promise<{
  title: string
  client: string
  site_address: string
  description: string
} | null> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    system: BEEZY_SYSTEM,
    messages: [{
      role: 'user',
      content: `Nathan wants to create a work order from this SMS: "${smsText}"

Extract the job details and return ONLY valid JSON:
- title (brief job title)
- client (client name if mentioned, otherwise "TBC")
- site_address (address if mentioned, otherwise "TBC")
- description (full description of work needed)

If this doesn't sound like a work order creation request, return null.
Return ONLY valid JSON or the word null.`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : 'null'
  if (text === 'null' || text === '') return null
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return null
  }
}
