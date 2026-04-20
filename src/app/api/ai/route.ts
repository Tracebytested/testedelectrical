import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { query } from '@/lib/db'
import { BUSINESS } from '@/lib/constants'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json()

    // Get recent context from DB
    const [recentJobs, recentInvoices] = await Promise.all([
      query(`SELECT j.job_number, j.title, j.status, j.site_address, c.name as client
             FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
             ORDER BY j.created_at DESC LIMIT 5`),
      query(`SELECT invoice_number, total, status FROM invoices ORDER BY created_at DESC LIMIT 5`)
    ])

    const systemContext = `You are the AI admin assistant for ${BUSINESS.name}, an electrical contracting business run by Nathan in Victoria, Australia.

Business details:
- ABN: ${BUSINESS.abn}, REC: ${BUSINESS.rec}, Licence: ${BUSINESS.licence}
- Phone: ${BUSINESS.phone}, Email: ${BUSINESS.email}

Recent jobs: ${JSON.stringify(recentJobs.rows)}
Recent invoices: ${JSON.stringify(recentInvoices.rows)}

You help Nathan manage his business. You can:
- Answer questions about jobs, invoices, quotes
- Help draft emails or messages
- Explain what's happening in the business
- Give advice on electrical business admin

Keep responses concise and practical. Nathan is a tradie, not a desk worker.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: systemContext,
      messages: [{ role: 'user', content: message }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ response: text })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
