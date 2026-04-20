import { query } from './db'
import { format } from 'date-fns'

export async function getNextJobNumber(): Promise<string> {
  const res = await query("SELECT nextval('job_number_seq') as val")
  return `J-${res.rows[0].val}`
}

export async function getNextQuoteNumber(): Promise<string> {
  const res = await query("SELECT nextval('quote_number_seq') as val")
  return `Q${res.rows[0].val}`
}

export async function getNextInvoiceNumber(): Promise<string> {
  const res = await query("SELECT nextval('invoice_number_seq') as val")
  return `${res.rows[0].val}`
}

export async function getNextReportNumber(): Promise<string> {
  const res = await query("SELECT nextval('report_number_seq') as val")
  return `RPT-${res.rows[0].val}`
}

export function calculateLineItems(items: Array<{ description: string; qty: number; rate: number }>) {
  const lineItems = items.map(item => {
    const amount = item.qty * item.rate
    const gst = parseFloat((amount * 0.1).toFixed(2))
    const subtotal = parseFloat((amount + gst).toFixed(2))
    return {
      description: item.description,
      qty: item.qty,
      rate: item.rate,
      amount: parseFloat(amount.toFixed(2)),
      gst,
      subtotal
    }
  })

  const subtotal = parseFloat(lineItems.reduce((s, i) => s + i.amount, 0).toFixed(2))
  const gst = parseFloat(lineItems.reduce((s, i) => s + i.gst, 0).toFixed(2))
  const total = parseFloat((subtotal + gst).toFixed(2))

  return { lineItems, subtotal, gst, total }
}

export function formatDate(date?: Date | string): string {
  if (!date) return format(new Date(), 'd/M/yy')
  return format(new Date(date), 'd/M/yy')
}

export function formatDateLong(date?: Date | string): string {
  if (!date) return format(new Date(), 'EEEE d MMMM yyyy')
  return format(new Date(date), 'EEEE d MMMM yyyy')
}

export function verifyDashboardAuth(password: string): boolean {
  return password === process.env.DASHBOARD_PASSWORD
}

// Extract text from a PDF buffer using pdf-parse
export async function extractPDFText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return data.text || ''
  } catch {
    return ''
  }
}

// Find or create a client record
export async function findOrCreateClient(data: {
  name: string
  email?: string
  company?: string
  is_agency?: boolean
}): Promise<number> {
  // Try to find existing
  const existing = await query(
    'SELECT id FROM clients WHERE LOWER(name) = LOWER($1) OR (email IS NOT NULL AND LOWER(email) = LOWER($2))',
    [data.name, data.email || '']
  )

  if (existing.rows.length > 0) {
    return existing.rows[0].id
  }

  // Create new
  const result = await query(
    'INSERT INTO clients (name, email, company, is_agency) VALUES ($1, $2, $3, $4) RETURNING id',
    [data.name, data.email, data.company, data.is_agency || false]
  )
  return result.rows[0].id
}
