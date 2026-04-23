import { google } from 'googleapis'

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return auth
}

export interface CalendarEvent {
  title: string
  description?: string
  location?: string
  startDate: string
  startTime?: string
  endTime?: string
  jobNumber?: string
}

export async function createCalendarEvent(event: CalendarEvent): Promise<{
  id: string
  link: string
  title: string
  start: string
} | null> {
  try {
    const calendar = google.calendar({ version: 'v3', auth: getAuth() })
    const startTime = event.startTime || '08:00'
    const parts = startTime.split(':').map(Number)
    const endH = parts[0] + 2
    const endTime = event.endTime || String(endH).padStart(2, '0') + ':' + String(parts[1]).padStart(2, '0')
    const startDateTime = event.startDate + 'T' + startTime + ':00+10:00'
    const endDateTime = event.startDate + 'T' + endTime + ':00+10:00'
    const description = [event.description || '', event.jobNumber ? 'Job #: ' + event.jobNumber : '', 'Created by Beezy - Tested Electrical Admin'].filter(Boolean).join('\n')
    const eventBody: any = {
      summary: event.title,
      description,
      start: { dateTime: startDateTime, timeZone: 'Australia/Melbourne' },
      end: { dateTime: endDateTime, timeZone: 'Australia/Melbourne' },
      colorId: '5',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 1440 }] }
    }
    if (event.location) { eventBody.location = event.location }
    const res = await calendar.events.insert({ calendarId: 'primary', requestBody: eventBody })
    return { id: res.data.id || '', link: res.data.htmlLink || '', title: res.data.summary || event.title, start: startDateTime }
  } catch (error) {
    console.error('Calendar error:', error)
    return null
  }
}

export async function getUpcomingEvents(days = 7): Promise<Array<{ id: string; title: string; start: string; location: string }>> {
  try {
    const calendar = google.calendar({ version: 'v3', auth: getAuth() })
    const now = new Date()
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    const res = await calendar.events.list({
      calendarId: 'primary', timeMin: now.toISOString(), timeMax: future.toISOString(),
      singleEvents: true, orderBy: 'startTime', maxResults: 20
    })
    return (res.data.items || []).map((e: any) => ({
      id: e.id || '', title: e.summary || '',
      start: (e.start && (e.start.dateTime || e.start.date)) || '',
      location: e.location || ''
    }))
  } catch { return [] }
}

export async function parseBookingFromSMS(text: string): Promise<{ title: string; date: string; time?: string; location?: string; description?: string } | null> {
  const Anthropic = require('@anthropic-ai/sdk').default
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const today = new Date().toISOString().split('T')[0]
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5', max_tokens: 300,
    messages: [{ role: 'user', content: 'Today is ' + today + ' (AEST). Extract calendar booking from: "' + text + '". Return JSON with title, date (YYYY-MM-DD), time (HH:MM), location, description. Or return null if not a booking.' }]
  })
  const result = response.content[0].type === 'text' ? response.content[0].text.trim() : 'null'
  if (result === 'null') return null
  try { return JSON.parse(result.replace(/```json|```/g, '').trim()) } catch { return null }
}
