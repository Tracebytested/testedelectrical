import { NextRequest, NextResponse } from 'next/server'
import { createCalendarEvent, getUpcomingEvents } from '@/lib/calendar'

export async function GET() {
  try {
    const events = await getUpcomingEvents(14)
    return NextResponse.json(events)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const event = await createCalendarEvent(data)
    if (!event) {
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
    }
    return NextResponse.json(event)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
