import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { generateReportPDF } from '@/lib/pdf'
import { generateReportFromDescription } from '@/lib/ai'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { getNextReportNumber, formatDate, formatDateLong } from '@/lib/utils'
import { BUSINESS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const result = await query(`
      SELECT r.*, c.name as client_name, c.email as client_email, j.title as job_title,
             j.site_address, j.work_order_ref, j.agency_contact
      FROM reports r
      LEFT JOIN clients c ON r.client_id = c.id
      LEFT JOIN jobs j ON r.job_id = j.id
      ORDER BY r.created_at DESC LIMIT 50
    `)
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()

    // If generating from Nathan's description
    if (data.generate_from_description && data.description) {
      const jobResult = await query(
        `SELECT j.*, c.name as client_name FROM jobs j LEFT JOIN clients c ON j.client_id = c.id WHERE j.id = $1`,
        [data.job_id]
      )
      const job = jobResult.rows[0]

      const reportData = await generateReportFromDescription({
        nathanDescription: data.description,
        jobTitle: job.title,
        client: job.client_name,
        siteAddress: job.site_address,
        workOrderRef: job.work_order_ref
      })

      const reportNumber = await getNextReportNumber()
      const result = await query(
        `INSERT INTO reports (report_number, job_id, client_id, title, task_information,
         investigation_findings, work_undertaken, remedial_action, recommended_followup,
         price_ex_gst, conducted_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'draft') RETURNING *`,
        [
          reportNumber, data.job_id, data.client_id, reportData.title,
          reportData.task_information, reportData.investigation_findings,
          reportData.work_undertaken, reportData.remedial_action,
          reportData.recommended_followup, reportData.price_ex_gst
        ]
      )
      return NextResponse.json(result.rows[0])
    }

    // Manual report creation
    const reportNumber = await getNextReportNumber()
    const result = await query(
      `INSERT INTO reports (report_number, job_id, client_id, title, task_information,
       investigation_findings, work_undertaken, remedial_action, recommended_followup,
       price_ex_gst, conducted_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), 'draft') RETURNING *`,
      [
        reportNumber, data.job_id, data.client_id, data.title,
        data.task_information, data.investigation_findings,
        data.work_undertaken, data.remedial_action,
        data.recommended_followup, data.price_ex_gst || 0
      ]
    )
    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - send report
export async function PUT(req: NextRequest) {
  try {
    const { report_id } = await req.json()

    const result = await query(`
      SELECT r.*, c.name as client_name, c.email as client_email,
             j.site_address, j.work_order_ref, j.agency_contact, j.job_number
      FROM reports r
      LEFT JOIN clients c ON r.client_id = c.id
      LEFT JOIN jobs j ON r.job_id = j.id
      WHERE r.id = $1
    `, [report_id])

    if (!result.rows.length) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const r = result.rows[0]

    const pdf = await generateReportPDF({
      report_number: r.report_number,
      conducted_on: formatDateLong(r.conducted_date),
      title: r.title,
      status: 'Completed',
      site_location: r.site_address,
      work_order: r.work_order_ref || r.job_number,
      client: r.client_name,
      contact: r.agency_contact || '',
      date_completed: formatDate(r.conducted_date),
      task_information: r.task_information,
      investigation_findings: r.investigation_findings,
      work_undertaken: r.work_undertaken,
      remedial_action: r.remedial_action,
      recommended_followup: r.recommended_followup,
      price_ex_gst: parseFloat(r.price_ex_gst) || 0
    })

    if (r.client_email) {
      await sendEmail({
        to: r.client_email,
        subject: `Service Report ${r.report_number} — ${r.title}`,
        body: buildEmailHTML(`
          <p>Hi ${r.agency_contact || r.client_name},</p>
          <p>Please find the completed service report attached for the following works:</p>
          <p><strong>${r.title}</strong><br>
          Site: ${r.site_address}<br>
          ${r.work_order_ref ? `Work Order: ${r.work_order_ref}<br>` : ''}
          Report #: ${r.report_number}</p>
          <p>Please don't hesitate to contact us if you have any questions.</p>
          <p>Nathan | ${BUSINESS.phone} | ${BUSINESS.name}</p>
        `),
        attachments: [{
          filename: `${r.report_number}_Service_Report.pdf`,
          content: pdf,
          contentType: 'application/pdf'
        }]
      })

      await query(
        "UPDATE reports SET status = 'sent', sent_at = NOW() WHERE id = $1",
        [report_id]
      )
    }

    return NextResponse.json({ success: true, report_number: r.report_number })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
