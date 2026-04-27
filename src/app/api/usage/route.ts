import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface ServiceUsage {
  name: string
  icon: string
  used: string
  limit: string
  percentage: number
  cost?: string
  status: 'ok' | 'warning' | 'critical'
  details?: string
}

async function getAnthropicUsage(): Promise<ServiceUsage> {
  try {
    // Anthropic doesn't have a public usage API, so we track from our DB
    const { query } = require('@/lib/db')
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

    // Count AI calls this month from SMS log and reports
    const smsCount = await query(
      "SELECT COUNT(*) as count FROM sms_log WHERE direction = 'inbound' AND created_at >= $1", [monthStart]
    )
    const reportCount = await query(
      "SELECT COUNT(*) as count FROM reports WHERE created_at >= $1", [monthStart]
    )
    const invoiceCount = await query(
      "SELECT COUNT(*) as count FROM invoices WHERE created_at >= $1", [monthStart]
    )

    const totalCalls = parseInt(smsCount.rows[0].count) + parseInt(reportCount.rows[0].count) + parseInt(invoiceCount.rows[0].count)
    // Rough estimate: ~$0.01-0.05 per AI call depending on complexity
    const estimatedCost = (totalCalls * 0.03).toFixed(2)

    return {
      name: 'Anthropic (Claude AI)',
      icon: '🤖',
      used: totalCalls + ' API calls',
      limit: 'Pay as you go',
      percentage: Math.min(totalCalls / 100 * 100, 100),
      cost: '$' + estimatedCost + ' est.',
      status: totalCalls > 500 ? 'warning' : 'ok',
      details: 'SMS processing, report generation, invoice line items'
    }
  } catch {
    return { name: 'Anthropic (Claude AI)', icon: '🤖', used: 'N/A', limit: 'Pay as you go', percentage: 0, status: 'ok' }
  }
}

async function getTwilioUsage(): Promise<ServiceUsage> {
  try {
    const { query } = require('@/lib/db')
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

    const inbound = await query(
      "SELECT COUNT(*) as count FROM sms_log WHERE direction = 'inbound' AND created_at >= $1", [monthStart]
    )
    const outbound = await query(
      "SELECT COUNT(*) as count FROM sms_log WHERE direction = 'outbound' AND created_at >= $1", [monthStart]
    )

    const totalSMS = parseInt(inbound.rows[0].count) + parseInt(outbound.rows[0].count)
    const estimatedCost = (totalSMS * 0.05).toFixed(2)

    return {
      name: 'Twilio (SMS)',
      icon: '💬',
      used: totalSMS + ' messages',
      limit: 'Pay as you go',
      percentage: Math.min(totalSMS / 200 * 100, 100),
      cost: '$' + estimatedCost + ' est.',
      status: totalSMS > 500 ? 'warning' : 'ok',
      details: 'In: ' + inbound.rows[0].count + ' | Out: ' + outbound.rows[0].count
    }
  } catch {
    return { name: 'Twilio (SMS)', icon: '💬', used: 'N/A', limit: 'Pay as you go', percentage: 0, status: 'ok' }
  }
}

async function getGmailUsage(): Promise<ServiceUsage> {
  try {
    const { query } = require('@/lib/db')
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

    const sent = await query(
      "SELECT COUNT(*) as count FROM invoices WHERE status = 'sent' AND sent_at >= $1", [monthStart]
    )
    const reportsSent = await query(
      "SELECT COUNT(*) as count FROM reports WHERE status = 'sent' AND sent_at >= $1", [monthStart]
    )

    const totalEmails = parseInt(sent.rows[0].count) + parseInt(reportsSent.rows[0].count)

    return {
      name: 'Gmail API',
      icon: '📧',
      used: totalEmails + ' emails sent',
      limit: '500/day',
      percentage: Math.min(totalEmails / 500 * 100, 100),
      status: totalEmails > 400 ? 'warning' : 'ok',
      details: 'Invoices: ' + sent.rows[0].count + ' | Reports: ' + reportsSent.rows[0].count
    }
  } catch {
    return { name: 'Gmail API', icon: '📧', used: 'N/A', limit: '500/day', percentage: 0, status: 'ok' }
  }
}

async function getRailwayUsage(): Promise<ServiceUsage> {
  return {
    name: 'Railway (Hosting)',
    icon: '🚂',
    used: 'Active',
    limit: '$5/month plan',
    percentage: 0,
    status: 'ok',
    details: 'Next.js + PostgreSQL'
  }
}

async function getGoogleDriveUsage(): Promise<ServiceUsage> {
  return {
    name: 'Google Drive',
    icon: '📁',
    used: 'Connected',
    limit: '15 GB storage',
    percentage: 0,
    status: 'ok',
    details: 'Inspection reports, work images'
  }
}

async function getGoogleCalendarUsage(): Promise<ServiceUsage> {
  return {
    name: 'Google Calendar',
    icon: '📅',
    used: 'Connected',
    limit: 'Unlimited',
    percentage: 0,
    status: 'ok',
    details: 'Job scheduling'
  }
}

export async function GET() {
  try {
    const services = await Promise.all([
      getAnthropicUsage(),
      getTwilioUsage(),
      getGmailUsage(),
      getRailwayUsage(),
      getGoogleDriveUsage(),
      getGoogleCalendarUsage(),
    ])
    return NextResponse.json(services)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
