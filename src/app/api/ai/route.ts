import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { query } from '@/lib/db'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { generateInvoicePDF, generateQuotePDF, generateReportPDF } from '@/lib/pdf'
import { generateReportFromDescription } from '@/lib/ai'
import { getNextInvoiceNumber, getNextQuoteNumber, getNextReportNumber, getNextJobNumber, calculateLineItems, formatDate, formatDateLong, findOrCreateClient } from '@/lib/utils'
import { BUSINESS, AGENT } from '@/lib/constants'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()

    const [recentJobs, recentInvoices, recentClients] = await Promise.all([
      query('SELECT j.job_number, j.title, j.status, j.site_address, c.name as client FROM jobs j LEFT JOIN clients c ON j.client_id = c.id ORDER BY j.created_at DESC LIMIT 10').catch(() => ({ rows: [] })),
      query('SELECT invoice_number, total, status FROM invoices ORDER BY created_at DESC LIMIT 5').catch(() => ({ rows: [] })),
      query('SELECT name, email, company FROM clients ORDER BY name ASC LIMIT 20').catch(() => ({ rows: [] }))
    ])

    const today = new Date().toISOString().split('T')[0]
    const systemPrompt = AGENT.personality + '\n\nToday is ' + today + '.\nBusiness: ' + BUSINESS.name + ' | ABN: ' + BUSINESS.abn + ' | REC: ' + BUSINESS.rec + '\nRecent jobs: ' + JSON.stringify(recentJobs.rows) + '\nRecent invoices: ' + JSON.stringify(recentInvoices.rows) + '\nClients: ' + JSON.stringify(recentClients.rows) + '\n\nYou can perform actions. If Nathan asks you to do something (create invoice, send email, create work order, etc), return JSON with action details. If it\'s just a question, reply normally.\n\nFor actions, return ONLY JSON:\n{"action":"create_invoice"|"create_job"|"send_email"|"general","details":{...},"reply":"confirmation message"}\n\nFor questions, just reply with text (no JSON).'

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Check if AI returned an action
    let parsed: any = null
    try {
      if (text.trim().startsWith('{')) {
        parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      }
    } catch {}

    if (parsed && parsed.action) {
      const d = parsed.details || {}

      if (parsed.action === 'create_job') {
        const cid = d.clientName ? await findOrCreateClient({ name: d.clientName, is_agency: false }) : null
        const jn = await getNextJobNumber()
        await query('INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source) VALUES ($1,$2,$3,$4,$5,\'pending\',\'dashboard\')',
          [jn, cid, d.title || 'New Job', d.description || '', d.address || ''])
        return NextResponse.json({ response: parsed.reply || ('Work order ' + jn + ' created!') })
      }

      if (parsed.action === 'create_invoice' && d.lineItems) {
        const items = (d.lineItems || []).filter((i: any) => i.rate > 0)
        if (items.length > 0) {
          const { lineItems, subtotal, gst, total } = calculateLineItems(items)
          const invNum = await getNextInvoiceNumber()
          await query('INSERT INTO invoices (invoice_number, line_items, subtotal, gst, total, status, due_date) VALUES ($1,$2,$3,$4,$5,\'draft\',$6)',
            [invNum, JSON.stringify(lineItems), subtotal, gst, total, new Date(Date.now() + 7 * 86400000)])

          if (d.email) {
            const invPDF = await generateInvoicePDF({
              invoice_number: invNum, date: formatDate(new Date()),
              bill_to_name: d.billToName || d.clientName || 'Client',
              bill_to_company: d.companyName, bill_to_address: d.address || '',
              line_items: lineItems, subtotal, gst, total
            })
            await sendEmail({
              to: d.email, subject: 'Invoice ' + invNum + ' - Tested Electrical',
              body: buildEmailHTML('<p>Please find attached invoice ' + invNum + ' for $' + total.toFixed(2) + ' inc GST.</p><p>Any questions or issues opening please let me know.</p><p>Kind Regards,<br>Nathan\'s Assistant B</p>'),
              attachments: [{ filename: 'Invoice_' + invNum + '.pdf', content: invPDF, contentType: 'application/pdf' }]
            })
            await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invNum])
            return NextResponse.json({ response: 'Invoice ' + invNum + ' ($' + total.toFixed(2) + ' inc GST) created and sent to ' + d.email })
          }
          return NextResponse.json({ response: 'Invoice ' + invNum + ' ($' + total.toFixed(2) + ' inc GST) created as draft.' })
        }
      }

      if (parsed.action === 'send_email' && d.email && d.body) {
        await sendEmail({
          to: d.email, subject: d.subject || 'Message from Tested Electrical',
          body: buildEmailHTML('<p>' + d.body.replace(/\n/g, '<br>') + '</p><p>Any questions or issues opening please let me know.</p><p>Kind Regards,<br>Nathan\'s Assistant B</p>'),
          attachments: []
        })
        return NextResponse.json({ response: 'Email sent to ' + d.email })
      }

      return NextResponse.json({ response: parsed.reply || 'Done!' })
    }

    return NextResponse.json({ response: text })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
