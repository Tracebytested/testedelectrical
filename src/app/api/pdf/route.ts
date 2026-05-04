import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { generateReportPDF, generateInvoicePDF, generateQuotePDF } from '@/lib/pdf'
import { formatDate, formatDateLong } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // report, invoice, quote
    const id = searchParams.get('id')

    if (!type || !id) {
      return NextResponse.json({ error: 'Missing type or id' }, { status: 400 })
    }

    let pdfBuffer: Buffer

    if (type === 'report') {
      const result = await query(`
        SELECT r.*, c.name as client_name, j.site_address, j.work_order_ref, j.agency_contact, j.job_number
        FROM reports r
        LEFT JOIN clients c ON r.client_id = c.id
        LEFT JOIN jobs j ON r.job_id = j.id
        WHERE r.id = $1
      `, [id])

      if (!result.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const r = result.rows[0]

      pdfBuffer = await generateReportPDF({
        report_number: r.report_number,
        conducted_on: formatDateLong(r.conducted_date || r.created_at),
        title: r.title,
        status: 'Completed',
        site_location: r.site_address || '',
        work_order: r.work_order_ref || r.job_number || '',
        client: r.client_name || '',
        contact: r.agency_contact || '',
        date_completed: formatDate(r.conducted_date || r.created_at),
        task_information: r.task_information || '',
        investigation_findings: r.investigation_findings || '',
        work_undertaken: r.work_undertaken || '',
        remedial_action: r.remedial_action || '',
        recommended_followup: r.recommended_followup || '',
        price_ex_gst: parseFloat(r.price_ex_gst) || 0
      })

    } else if (type === 'invoice') {
      const result = await query(`
        SELECT i.*, c.name as client_name, c.email as client_email, c.phone as client_phone,
          c.company as client_company, c.address as client_address,
          j.site_address, j.title as job_title
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN jobs j ON i.job_id = j.id
        WHERE i.id = $1
      `, [id])

      if (!result.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const inv = result.rows[0]

      pdfBuffer = await generateInvoicePDF({
        invoice_number: inv.invoice_number,
        date: formatDate(inv.created_at),
        bill_to_name: inv.client_name || '',
        bill_to_company: inv.client_company || '',
        bill_to_address: inv.site_address || inv.client_address || '',
        bill_to_email: inv.client_email || '',
        bill_to_phone: inv.client_phone || '',
        line_items: inv.line_items,
        subtotal: parseFloat(inv.subtotal),
        gst: parseFloat(inv.gst),
        total: parseFloat(inv.total)
      })

    } else if (type === 'quote') {
      const result = await query(`
        SELECT q.*, c.name as client_name, c.email as client_email, c.phone as client_phone,
          c.company as client_company, c.address as client_address,
          j.site_address, j.title as job_title
        FROM quotes q
        LEFT JOIN clients c ON q.client_id = c.id
        LEFT JOIN jobs j ON q.job_id = j.id
        WHERE q.id = $1
      `, [id])

      if (!result.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const q = result.rows[0]
      const notes = q.notes ? q.notes.split('\n').filter(Boolean) : []

      pdfBuffer = await generateQuotePDF({
        quote_number: q.quote_number,
        date: formatDate(q.created_at),
        quote_to_name: q.client_name || '',
        quote_to_company: q.client_company || '',
        quote_to_address: q.site_address || q.client_address || '',
        quote_to_email: q.client_email || '',
        quote_to_phone: q.client_phone || '',
        line_items: q.line_items,
        subtotal: parseFloat(q.subtotal),
        gst: parseFloat(q.gst),
        total: parseFloat(q.total),
        notes
      })

    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const uint8Array = new Uint8Array(pdfBuffer)
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${type}-${id}.pdf"`,
        'Cache-Control': 'no-store'
      }
    })

  } catch (error: any) {
    console.error('PDF view error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
