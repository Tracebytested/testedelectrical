import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

    const smsIn = await query("SELECT COUNT(*) as c FROM sms_log WHERE direction='inbound' AND created_at >= $1", [monthStart]).catch(() => ({ rows: [{ c: '0' }] }))
    const smsOut = await query("SELECT COUNT(*) as c FROM sms_log WHERE direction='outbound' AND created_at >= $1", [monthStart]).catch(() => ({ rows: [{ c: '0' }] }))
    const reports = await query("SELECT COUNT(*) as c FROM reports WHERE created_at >= $1", [monthStart]).catch(() => ({ rows: [{ c: '0' }] }))
    const invoices = await query("SELECT COUNT(*) as c FROM invoices WHERE created_at >= $1", [monthStart]).catch(() => ({ rows: [{ c: '0' }] }))
    const emailsSent = await query("SELECT COUNT(*) as c FROM invoices WHERE status='sent' AND sent_at >= $1", [monthStart]).catch(() => ({ rows: [{ c: '0' }] }))
    const reportsSent = await query("SELECT COUNT(*) as c FROM reports WHERE status='sent' AND sent_at >= $1", [monthStart]).catch(() => ({ rows: [{ c: '0' }] }))

    const smsTotal = parseInt(smsIn.rows[0].c) + parseInt(smsOut.rows[0].c)
    const aiCalls = parseInt(smsIn.rows[0].c) + parseInt(reports.rows[0].c) + parseInt(invoices.rows[0].c)
    const emailTotal = parseInt(emailsSent.rows[0].c) + parseInt(reportsSent.rows[0].c)

    const services = [
      {
        name: 'Anthropic (Claude AI)', icon: '🤖',
        used: aiCalls + ' API calls',
        limit: 'Pay as you go',
        percentage: Math.min(aiCalls / 100 * 100, 100),
        cost: '$' + (aiCalls * 0.03).toFixed(2) + ' est.',
        status: aiCalls > 500 ? 'warning' : 'ok',
        details: 'SMS: ' + smsIn.rows[0].c + ' | Reports: ' + reports.rows[0].c + ' | Invoices: ' + invoices.rows[0].c
      },
      {
        name: 'Twilio (SMS)', icon: '💬',
        used: smsTotal + ' messages',
        limit: 'Pay as you go',
        percentage: Math.min(smsTotal / 200 * 100, 100),
        cost: '$' + (smsTotal * 0.05).toFixed(2) + ' est.',
        status: smsTotal > 500 ? 'warning' : 'ok',
        details: 'In: ' + smsIn.rows[0].c + ' | Out: ' + smsOut.rows[0].c
      },
      {
        name: 'Gmail API', icon: '📧',
        used: emailTotal + ' emails sent',
        limit: '500/day',
        percentage: Math.min(emailTotal / 500 * 100, 100),
        status: emailTotal > 400 ? 'warning' : 'ok',
        details: 'Invoices: ' + emailsSent.rows[0].c + ' | Reports: ' + reportsSent.rows[0].c
      },
      { name: 'Railway (Hosting)', icon: '🚂', used: 'Active', limit: '$5/month', percentage: 0, status: 'ok', details: 'Next.js + PostgreSQL' },
      { name: 'Google Drive', icon: '📁', used: 'Connected', limit: '15 GB', percentage: 0, status: 'ok', details: 'Inspections & work images' },
      { name: 'Google Calendar', icon: '📅', used: 'Connected', limit: 'Unlimited', percentage: 0, status: 'ok', details: 'Job scheduling' },
    ]

    return NextResponse.json(services)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
