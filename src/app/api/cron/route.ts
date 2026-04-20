import { NextRequest, NextResponse } from 'next/server'

// Called by Railway cron scheduler twice daily
// 7am AEST = 21:00 UTC, 9pm AEST = 11:00 UTC
// Railway cron schedule: 0 21,11 * * *

export async function GET(req: NextRequest) {
  try {
    const baseUrl = process.env.APP_URL || `https://${req.headers.get('host')}`
    const res = await fetch(`${baseUrl}/api/gmail`, { method: 'POST' })
    const data = await res.json()
    console.log('Scheduled email check:', data)
    return NextResponse.json({ success: true, time: new Date().toISOString(), result: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
