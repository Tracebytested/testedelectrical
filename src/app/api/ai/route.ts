import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { query } from '@/lib/db'
import { BUSINESS, AGENT } from '@/lib/constants'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()

    const [recentJobs, recentInvoices] = await Promise.all([
      query(`SELECT j.job_number, j.title, j.status, j.site_address, c.name as client
             FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
             ORDER BY j.created_at DESC LIMIT 5`).catch(() => ({ rows: [] })),
      query(`SELECT invoice_number, total, status FROM invoices ORDER BY created_at DESC LIMIT 5`).catch(() => ({ rows: [] }))
    ])

    const systemPrompt = `${AGENT.personality}

Business details:
- Company: ${BUSINESS.name}
- ABN: ${BUSINESS.abn}, REC: ${BUSINESS.rec}, Licence: ${BUSINESS.licence}
- Phone: ${BUSINESS.phone}, Email: ${BUSINESS.email}
- Address: ${BUSINESS.address}

Recent jobs: ${JSON.stringify(recentJobs.rows)}
Recent invoices: ${JSON.stringify(recentInvoices.rows)}

When Nathan calls you Beezy, respond naturally. Keep replies concise — Nathan is a sparky on the tools, not sitting at a desk.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ response: text })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
