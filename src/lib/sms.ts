import twilio from 'twilio'
import { BUSINESS } from './constants'

function getTwilioClient() {
  return twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  )
}

export async function sendSMS(to: string, body: string) {
  const client = getTwilioClient()
  await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to
  })
}

export async function sendNathanSMS(body: string) {
  await sendSMS(BUSINESS.phone_e164, body)
}

// Format a job summary SMS for Nathan
export function formatJobAlert(job: {
  job_number: string
  title: string
  client: string
  site_address: string
  work_order_ref?: string
}): string {
  return `🔔 NEW WORK ORDER — ${job.job_number}
Client: ${job.client}
Job: ${job.title}
Site: ${job.site_address}
${job.work_order_ref ? `WO Ref: ${job.work_order_ref}` : ''}

Reply to this number with a job update when complete and I'll write the report + invoice.`
}

// Parse an inbound SMS from Nathan and extract job info
export function parseJobUpdateSMS(body: string): {
  jobRef?: string
  message: string
} {
  // Look for job number pattern like J-1001 or WO-1046
  const jobMatch = body.match(/([JW]O?[-#]?\d{3,6})/i)
  return {
    jobRef: jobMatch?.[1],
    message: body
  }
}
