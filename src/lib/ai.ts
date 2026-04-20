import Anthropic from '@anthropic-ai/sdk'
import { BUSINESS } from './constants'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// Extract work order info from an email/PDF text
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
    model: 'claude-sonnet-4-20250514',
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

// Generate a service report from Nathan's verbal description
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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `You are the admin assistant for ${BUSINESS.name}, an electrical contractor.

Nathan (the electrician) has described a completed job. Write a professional service report.

Job details:
- Job title: ${input.jobTitle}
- Client: ${input.client}
- Site: ${input.siteAddress}
- Work order ref: ${input.workOrderRef || 'N/A'}

Nathan's description of what happened:
"${input.nathanDescription}"

Generate a professional service report. Return ONLY valid JSON with these fields:
- title (professional report title based on the job)
- task_information (formal description of the task/scope of work, 1-2 sentences)
- investigation_findings (what was found/diagnosed, written professionally)
- work_undertaken (what was actually done, step by step in past tense, professional tone)
- remedial_action (summary of rectification performed)
- recommended_followup (any recommendations for future work, or "No further action required" if none)
- price_ex_gst (extract dollar amount if mentioned, otherwise 0)

Write in formal electrical contractor report style. Be specific and professional.
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

// Generate a quote from a job description
export async function generateQuoteItems(jobDescription: string): Promise<Array<{
  description: string
  qty: number
  rate: number
}>> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are the admin assistant for ${BUSINESS.name}, an electrical contractor in Victoria, Australia.

Generate quote line items for the following job. Use realistic Australian electrical contractor pricing (2025 rates).

Job description: "${jobDescription}"

Standard rates for reference:
- Call out fee: $160 inc GST
- Labour per hour: $120-150 ex GST
- Common items: supply & install GPO $180, supply & install light $150-250, switchboard work $200-400/circuit

Return ONLY a JSON array of line items with these fields:
- description (clear item description)
- qty (quantity as number)
- rate (rate per item in dollars ex GST, as number)

Return ONLY valid JSON array, no other text. Maximum 6 line items.`
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

// Generate a professional email reply to a client/agency
export async function generateEmailReply(context: {
  originalEmail: string
  purpose: 'acknowledge_work_order' | 'send_quote' | 'send_invoice' | 'send_report' | 'general'
  clientName: string
  jobTitle?: string
  additionalInfo?: string
}): Promise<string> {
  const purposes: Record<string, string> = {
    acknowledge_work_order: 'Acknowledge receipt of work order and confirm you will attend',
    send_quote: 'Send a quote for the requested work',
    send_invoice: 'Send an invoice for completed work',
    send_report: 'Send a completed service/job report',
    general: 'Reply professionally to the email'
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `Write a professional email body for ${BUSINESS.name} (electrical contractor).

Purpose: ${purposes[context.purpose]}
Client: ${context.clientName}
${context.jobTitle ? `Job: ${context.jobTitle}` : ''}
${context.additionalInfo ? `Additional context: ${context.additionalInfo}` : ''}

Original email:
${context.originalEmail.substring(0, 500)}

Write a brief, professional email body only (no subject line, no "Dear" header needed - just the body paragraphs). 
Sign off with: Nathan | ${BUSINESS.phone} | ${BUSINESS.name}
Keep it concise and professional. Australian business tone.`
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

// Process an inbound SMS from Nathan describing a completed job
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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are the AI admin assistant for ${BUSINESS.name}. Nathan has sent you an SMS after completing a job.

${jobContext ? `Current job context:
- Title: ${jobContext.title}
- Client: ${jobContext.client}
- Site: ${jobContext.site}
- Work order: ${jobContext.workOrderRef || 'N/A'}` : ''}

Nathan's SMS: "${smsText}"

Determine what Nathan needs and return ONLY valid JSON:
- action: one of "generate_report" (if describing completed work), "update_job" (status update only), "question" (if Nathan is asking something), "unknown"
- response: A brief SMS reply to Nathan (max 160 chars) confirming what you're doing
- summary: If action is generate_report, brief summary of what was done (for context)

Return ONLY valid JSON, no other text.`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return {
      action: 'unknown',
      response: "Got your message Nathan. I couldn't process it automatically - please check the dashboard."
    }
  }
}
