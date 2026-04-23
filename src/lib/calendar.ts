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
  startDate: string // YYYY-MM-DD
  startTime?: string // HH:MM (24hr), defaults to 08:00
  endTime?: string // HH:MM (24hr), defaults to startTime + 2hrs
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
    const [startH, startM] = startTime.split(':').map(Number)
    const endH = startH + 2
    const endTime = event.endTime || `${String(endH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`

    const startDateTime = `${event.startDate}T${startTime}:00+10:00`
    const endDateTime = `${event.startDate}T${endTime}:00+10:00`

    const description = [
      event.description || '',
      event.jobNumber ? `Job #: ${event.jobNumber}` : '',
      'Created by Beezy — Tested Electrical Admin'
    ].filter(Boolean).join('\n')

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.title,
        description,
        location: event.location,
        start: { dateTime: startDateTime, timeZone: 'Australia/Melbourne' },
        end: { dateTime: endDateTime, timeZone: 'Australia/Melbourne' },
        colorId: '5', // Yellow to match brand
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 1440 } // Day before
          ]
        }
      }
    })

    return {
      id: res.data.id || '',
      link: res.data.htmlLink || '',
      title: res.data.summary || event.title,
      start: startDateTime
    }
  } catch (error) {
    console.error('Calendar error:', error)
    return null
  }
}

export async function getUpcomingEvents(days = 7): Promise<Array<{
  id: string
  title: string
  start: string
  location?: string
}>> {
  try {
    const calendar = google.calendar({ version: 'v3', auth: getAuth() })
    const now = new Date()
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20
    })

    return (res.data.items || []).map(e => ({
      id: e.id || '',
      title: e.summary || '',
      start: e.start?.dateTime || e.start?.date || '',
      location: e.location
    }))
  } catch {
    return []
  }
}

// Parse booking intent from SMS
export async function parseBookingFromSMS(text: string): Promise<{
  title: string
  date: string // YYYY-MM-DD
  time?: string // HH:MM
  location?: string
  description?: string
} | null> {
  const Anthropic = require('@anthropic-ai/sdk').default
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const today = new Date().toISOString().split('T')[0]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Today is ${today} (AEST). Extract calendar booking details from this message.

Message: "${text}"

Return ONLY valid JSON or null if no booking intended:
- title (event title, e.g. "Electrical Inspection - 45 Brown St")
- date (YYYY-MM-DD format — interpret "tomorrow", "Monday", "next week" etc relative to today)
- time (HH:MM 24hr format if mentioned, otherwise omit)
- location (address if mentioned)
- description (any extra details)

Return ONLY valid JSON or the word null.`
    }]
  })

  const text2 = response.content[0].type === 'text' ? response.content[0].text.trim() : 'null'
  if (text2 === 'null') return null
  try {
    return JSON.parse(text2.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}
