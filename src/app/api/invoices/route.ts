import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { generateInvoicePDF } from '@/lib/pdf'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { generateQuoteItems } from '@/lib/ai'
import { getNextInvoiceNumber, calculateLineItems, formatDate } from '@/lib/utils'
import { BUSINESS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (id) {
      const result = await query(`
        SELECT i.*, c.name as client_name, c.email as client_email, j.title as job_title, j.site_address
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN jobs j ON i.job_id = j.id
        WHERE i.id = $1
      `, [id])
      if (!result.rows.length) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }
      return NextResponse.json(result.rows[0])
    }

    const result = await query(`
      SELECT i.*, c.name as client_name, c.email as client_email, j.title as job_title, j.site_address
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN jobs j ON i.job_id = j.id
      ORDER BY i.created_at DESC LIMIT 50
    `)
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()

    // If AI generation requested
    let lineItemsRaw = data.line_items
    if (data.generate_from_description && data.description) {
      lineItemsRaw = await generateQuoteItems(data.description)
    }

    const { lineItems, subtotal, gst, total } = calculateLineItems(lineItemsRaw)

    const invoiceNumber = await getNextInvoiceNumber()
    const today = new Date()
    const dueDate = new Date(today.getTime() + BUSINESS.payment_terms_days * 24 * 60 * 60 * 1000)

    const result = await query(
      `INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8) RETURNING *`,
      [invoiceNumber, data.job_id, data.client_id, JSON.stringify(lineItems), subtotal, gst, total, dueDate]
    )

    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/invoices/send
export async function PUT(req: NextRequest) {
  try {
    const { invoice_id } = await req.json()

    const result = await query(`
      SELECT i.*, c.name as client_name, c.email as client_email, j.title as job_title, j.site_address
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN jobs j ON i.job_id = j.id
      WHERE i.id = $1
    `, [invoice_id])

    if (!result.rows.length) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const inv = result.rows[0]

    const pdf = await generateInvoicePDF({
      invoice_number: inv.invoice_number,
      date: formatDate(inv.created_at),
      bill_to_name: inv.bill_to_name || inv.client_name,
      bill_to_company: inv.bill_to_company || undefined,
      bill_to_address: inv.bill_to_address || inv.site_address,
      bill_to_email: inv.client_email || undefined,
      bill_to_phone: inv.client_phone || undefined,
      line_items: inv.line_items,
      subtotal: parseFloat(inv.subtotal),
      gst: parseFloat(inv.gst),
      total: parseFloat(inv.total)
    })

    if (inv.client_email) {
      await sendEmail({
        to: inv.client_email,
        subject: `Invoice ${inv.invoice_number} — ${BUSINESS.name}`,
        body: buildEmailHTML(`
          <p>Hi ${inv.client_name},</p>
          <p>Please find your invoice attached for ${inv.job_title || 'recent electrical works'}.</p>
          <p><strong>Invoice #:</strong> ${inv.invoice_number}<br>
          <strong>Amount Due:</strong> $${parseFloat(inv.total).toFixed(2)} (inc. GST)<br>
          <strong>Due:</strong> Within ${BUSINESS.payment_terms_days} days</p>
          <p><strong>Payment Options:</strong><br>
          Bank Transfer: BSB ${BUSINESS.bank.bsb} | Acc ${BUSINESS.bank.account}<br>
          PayID: ${BUSINESS.bank.payid}<br>
          Please reference Invoice #${inv.invoice_number}</p>
          <p>Thank you for your business!<br>Nathan | ${BUSINESS.phone}</p>
        `),
        attachments: [{
          filename: `Invoice_${inv.invoice_number}.pdf`,
          content: pdf,
          contentType: 'application/pdf'
        }]
      })

      await query(
        "UPDATE invoices SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = NOW() WHERE id = $1",
        [invoice_id]
      )
    }

    return NextResponse.json({ success: true, invoice_number: inv.invoice_number })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const data = await req.json()

    // Simple status update (e.g. mark as paid)
    if (data.id && data.status && !data.line_items) {
      const result = await query(
        `UPDATE invoices SET status = $1, paid_at = $2 WHERE id = $3 RETURNING *`,
        [data.status, data.paid_at || null, data.id]
      )
      return NextResponse.json(result.rows[0])
    }

    // Full invoice edit
    if (!data.id) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })
    }

    const { lineItems, subtotal, gst, total } = calculateLineItems(data.line_items)

    const result = await query(
      `UPDATE invoices
       SET client_id = $1, job_id = $2, line_items = $3, subtotal = $4, gst = $5, total = $6
       WHERE id = $7 RETURNING *`,
      [data.client_id, data.job_id, JSON.stringify(lineItems), subtotal, gst, total, data.id]
    )

    if (!result.rows.length) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
