import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const [jobStats, invoiceStats, quoteStats, recentJobs] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'invoiced') as invoiced,
          COUNT(*) as total
        FROM jobs
      `).catch(() => ({ rows: [{ pending: '0', active: '0', completed: '0', invoiced: '0', total: '0' }] })),

      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'paid') as paid,
          COUNT(*) FILTER (WHERE status = 'overdue') as overdue,
          COALESCE(SUM(total) FILTER (WHERE status IN ('sent', 'draft') AND total > 0), 0) as outstanding,
          COALESCE(SUM(total) FILTER (WHERE status = 'paid' AND paid_at > NOW() - INTERVAL '30 days'), 0) as paid_this_month
        FROM invoices
      `).catch(() => ({ rows: [{ sent: '0', paid: '0', overdue: '0', outstanding: '0', paid_this_month: '0' }] })),

      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'draft') as draft,
          COUNT(*) FILTER (WHERE status = 'sent') as sent,
          COUNT(*) FILTER (WHERE status = 'accepted') as accepted
        FROM quotes
      `).catch(() => ({ rows: [{ draft: '0', sent: '0', accepted: '0' }] })),

      query(`
        SELECT j.id, j.job_number, j.title, j.status, j.site_address, j.created_at, c.name as client_name
        FROM jobs j
        LEFT JOIN clients c ON j.client_id = c.id
        ORDER BY j.created_at DESC LIMIT 8
      `).catch(() => ({ rows: [] })),
    ])

    return NextResponse.json({
      jobs: jobStats.rows[0],
      invoices: invoiceStats.rows[0],
      quotes: quoteStats.rows[0],
      recent_jobs: recentJobs.rows,
      recent_emails: []
    })
  } catch (error: any) {
    return NextResponse.json({
      jobs: { pending: '0', active: '0', completed: '0', invoiced: '0', total: '0' },
      invoices: { sent: '0', paid: '0', overdue: '0', outstanding: '0', paid_this_month: '0' },
      quotes: { draft: '0', sent: '0', accepted: '0' },
      recent_jobs: [],
      recent_emails: [],
      error: error.message
    })
  }
}
