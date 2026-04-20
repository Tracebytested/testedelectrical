import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { generateQuotePDF } from '@/lib/pdf'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { generateQuoteItems } from '@/lib/ai'
import { getNextQuoteNumber, calculateLineItems, formatDate } from '@/lib/utils'
import { BUSINESS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const result = await query(`
      SELECT q.*, c.name as client_name, c.email as client_email, j.title as job_title, j.site_address
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN jobs j ON q.job_id = j.id
      ORDER BY q.created_at DESC LIMIT 50
    `)
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()

    let lineItemsRaw = data.line_items
    if (data.generate_from_description && data.description) {
      lineItemsRaw = await generateQuoteItems(data.description)
    }

    const { lineItems, subtotal, gst, total } = calculateLineItems(lineItemsRaw)
    const quoteNumber = await getNextQuoteNumber()

    const result = await query(
      `INSERT INTO quotes (quote_number, job_id, client_id, line_items, subtotal, gst, total, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') RETURNING *`,
      [quoteNumber, data.job_id, data.client_id, JSON.stringify(lineItems), subtotal, gst, total, data.notes || '']
    )

    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { quote_id } = await req.json()

    const result = await query(`
      SELECT q.*, c.name as client_name, c.email as client_email, j.title as job_title, j.site_address
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN jobs j ON q.job_id = j.id
      WHERE q.id = $1
    `, [quote_id])

    if (!result.rows.length) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const q = result.rows[0]
    const notes = q.notes ? q.notes.split('\n').filter(Boolean) : []

    const pdf = await generateQuotePDF({
      quote_number: q.quote_number,
      date: formatDate(q.created_at),
      quote_to_name: q.client_name,
      quote_to_address: q.site_address,
      line_items: q.line_items,
      subtotal: parseFloat(q.subtotal),
      gst: parseFloat(q.gst),
      total: parseFloat(q.total),
      notes
    })

    if (q.client_email) {
      await sendEmail({
        to: q.client_email,
        subject: `Quote ${q.quote_number} — ${BUSINESS.name}`,
        body: buildEmailHTML(`
          <p>Hi ${q.client_name},</p>
          <p>Thank you for reaching out. Please find your quote attached${q.job_title ? ` for ${q.job_title}` : ''}.</p>
          <p><strong>Quote #:</strong> ${q.quote_number}<br>
          <strong>Total:</strong> $${parseFloat(q.total).toFixed(2)} (inc. GST)<br>
          <strong>Valid for:</strong> ${BUSINESS.quote_valid_days} days</p>
          <p>If you can provide a cheaper quote, we will try to match it.<br>
          Please don't hesitate to contact us with any questions.</p>
          <p>Nathan | ${BUSINESS.phone} | ${BUSINESS.email}</p>
        `),
        attachments: [{
          filename: `Quote_${q.quote_number}.pdf`,
          content: pdf,
          contentType: 'application/pdf'
        }]
      })

      await query(
        "UPDATE quotes SET status = 'sent', sent_at = NOW() WHERE id = $1",
        [quote_id]
      )
    }

    return NextResponse.json({ success: true, quote_number: q.quote_number })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
