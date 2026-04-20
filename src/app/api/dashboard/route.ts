import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const [jobStats, invoiceStats, quoteStats, recentJobs, recentEmails] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'invoiced') as invoiced,
          COUNT(*) as total
        FROM jobs
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'paid') as paid,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue,
          COALESCE(SUM(total) FILTER (WHERE status = 'sent'), 0) as outstanding,
          COALESCE(SUM(total) FILTER (WHERE status = 'paid' AND paid_at > NOW() - INTERVAL '30 days'), 0) as paid_this_month
        FROM invoices
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'draft') as draft,
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'accepted') as accepted
        FROM quotes
      `),
      query(`
        SELECT j.*, c.name as client_name
        FROM jobs j
        LEFT JOIN clients c ON j.client_id = c.id
        ORDER BY j.created_at DESC LIMIT 8
      `),
      query(`
        SELECT * FROM emails ORDER BY received_at DESC LIMIT 5
      `)
    ])

    return NextResponse.json({
      jobs: jobStats.rows[0],
      invoices: invoiceStats.rows[0],
      quotes: quoteStats.rows[0],
      recent_jobs: recentJobs.rows,
      recent_emails: recentEmails.rows
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
