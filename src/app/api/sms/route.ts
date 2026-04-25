import { NextRequest, NextResponse } from 'next/server'
import { processJobUpdateSMS, generateReportFromDescription, processCreateWorkOrderSMS } from '@/lib/ai'
import { findAllInspectionReports, downloadDriveFile, getRecentJobPhotos } from '@/lib/drive'
import { createCalendarEvent, parseBookingFromSMS } from '@/lib/calendar'
import { sendSMS } from '@/lib/sms'
import { generateReportPDF, generateInvoicePDF } from '@/lib/pdf'
import { sendEmail, buildEmailHTML } from '@/lib/gmail'
import { query } from '@/lib/db'
import {
  getNextReportNumber,
  getNextInvoiceNumber,
  getNextJobNumber,
  calculateLineItems,
  formatDate,
  formatDateLong,
  findOrCreateClient
} from '@/lib/utils'
import { BUSINESS } from '@/lib/constants'

const AUTHORISED_NUMBERS = [
  '+61407180596',
  '+61429604291',
]

async function replyTo(from: string, message: string) {
  await sendSMS(from, message)
}

const DRIVE_KEYWORDS = [
  'google drive', 'from drive', 'on drive', 'in drive',
  'send the inspection', 'send inspection report', 'attach the report from drive',
  'send the safety', 'attach inspection', 'send from drive',
  'safety inspection report', 'send the certificate',
  'attach both reports', 'attach the reports', 'attach report',
  'reports i have made', 'reports i made', 'reports from my drive',
  'files from drive', 'attach files', 'send the files',
  'i have made on google drive', 'i made on google drive',
  'attach both', 'send both reports'
]

const CALENDAR_KEYWORDS = [
  'add to calendar', 'put in calendar',
  'schedule a job', 'add job to calendar', 'book for', 'schedule for',
  'book the job', 'diary', 'what have i got', 'whats on', "what's on"
]

const INVOICE_ONLY_KEYWORDS = [
  'just invoice', 'only invoice', 'invoice only', 'send an invoice',
  'create an invoice', 'generate an invoice', 'make an invoice',
  'invoice nathan', 'invoice me', 'invoice them for', 'invoice client for',
  'send invoice for', 'please invoice'
]

const COMPLETE_KEYWORDS = [
  'just finished', 'just done', 'completed', 'all done', 'job done',
  'finished the', 'done the', 'wrapped up', 'just completed',
  'invoice', 'invoice client', 'send invoice', 'invoice them',
  'fill report', 'complete report', 'write report', 'send report',
  'charge them', 'charge client', 'bill them', 'bill client',
  'report and invoice', 'invoice and report', 'has been completed',
  'been completed', 'generate a report', 'please generate'
]

const CREATE_KEYWORDS = [
  'create a work order', 'new work order', 'add a job',
  'new job for', 'create job', 'log a job', 'book a job'
]

function detectIntent(text: string): 'complete' | 'create' | 'drive' | 'calendar' | 'invoice_only' | 'unknown' {
  const lower = text.toLowerCase()
  for (const kw of DRIVE_KEYWORDS) {
    if (lower.includes(kw)) return 'drive'
  }
  for (const kw of CALENDAR_KEYWORDS) {
    if (lower.includes(kw)) return 'calendar'
  }
  for (const kw of INVOICE_ONLY_KEYWORDS) {
    if (lower.includes(kw)) return 'invoice_only'
  }
  for (const kw of CREATE_KEYWORDS) {
    if (lower.includes(kw)) return 'create'
  }
  for (const kw of COMPLETE_KEYWORDS) {
    if (lower.includes(kw)) return 'complete'
  }
  return 'unknown'
}

function extractEmail(text: string): string | null {
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
  return match ? match[0] : null
}

function extractPrice(text: string): number {
  // Handle formats: $400, $1,000, $1,000,000, $1.50
  const match = text.match(/\$(\d[\d,]*(?:\.\d{1,2})?)/)
  if (!match) return 0
  return parseFloat(match[1].replace(/,/g, ''))
})?)/)
  return match ? parseFloat(match[1]) : 0
}

// Extract the street name from a message
function extractStreetName(text: string): string {
  const SKIP_WORDS = new Set([
    'invoice', 'attach', 'both', 'reports', 'report', 'drive', 'google',
    'send', 'made', 'have', 'unit', 'please', 'that', 'the', 'and',
    'for', 'from', 'with', 'this', 'them', 'also', 'just', 'all',
    'my', 'today', 'uploaded', 'street', 'road', 'avenue', 'both',
    'documents', 'document', 'files', 'file', 'please', 'kilaris'
  ])

  // Best: word that appears right before "st", "street", "rd" etc
  const streetSuffixMatch = text.match(/([a-zA-Z]{4,})\s+(?:st|street|rd|road|ave|avenue|blvd|dr|drive)/i)
  if (streetSuffixMatch) {
    const word = streetSuffixMatch[1].toLowerCase()
    if (!SKIP_WORDS.has(word)) return streetSuffixMatch[1]
  }

  // Second: word after "unit X" - e.g. "unit 1 sheffield" -> "sheffield"  
  const afterUnit = text.match(/unit\s+\d+\s+([a-zA-Z]{4,})/i)
  if (afterUnit && !SKIP_WORDS.has(afterUnit[1].toLowerCase())) {
    return afterUnit[1]
  }

  // Third: any word 4+ chars not in skip list
  const words = text.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/)
  for (const word of words) {
    if (word.length >= 4 && !SKIP_WORDS.has(word.toLowerCase())) {
      return word
    }
  }
  return ''
}

async function findJob(body: string): Promise<any | null> {
  const jobRefMatch = body.match(/([JW]O?[-#]?\d{3,6})/i)
  if (jobRefMatch) {
    const ref = jobRefMatch[1]
    const result = await query(
      `SELECT j.*, c.name as client_name, c.email as client_email, j.agency_contact
       FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
       WHERE j.job_number ILIKE $1 OR j.work_order_ref ILIKE $1 LIMIT 1`,
      [`%${ref}%`]
    )
    if (result.rows.length > 0) return result.rows[0]
  }
  const addressMatch = body.match(/(\d+\s+[A-Za-z]+\s+(?:st|street|rd|road|ave|avenue|blvd|drive|dr|ct|court|way|cres|crescent|pl|place)[,\s])/i)
  if (addressMatch) {
    const addressFragment = addressMatch[1].trim().replace(/,$/, '')
    const result = await query(
      `SELECT j.*, c.name as client_name, c.email as client_email, j.agency_contact
       FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
       WHERE j.site_address ILIKE $1 AND j.status IN ('pending', 'active')
       ORDER BY j.created_at DESC LIMIT 1`,
      [`%${addressFragment}%`]
    )
    if (result.rows.length > 0) return result.rows[0]
  }
  const result = await query(
    `SELECT j.*, c.name as client_name, c.email as client_email, j.agency_contact
     FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
     WHERE j.status IN ('pending', 'active') ORDER BY j.created_at DESC LIMIT 1`
  )
  return result.rows.length > 0 ? result.rows[0] : null
}

async function generateAndSendReportInvoice(job: any, body: string, from: string) {
  let photos: Buffer[] = []
  try {
    const photoFiles = await getRecentJobPhotos(job.site_address)
    if (photoFiles.length > 0) {
      const photoBuffers = await Promise.all(
        photoFiles.slice(0, 6).map((f: any) => downloadDriveFile(f.id).catch(() => null))
      )
      photos = photoBuffers.filter((b): b is Buffer => b !== null)
    }
  } catch (e) {
    console.error('Photo fetch error:', e)
  }

  const reportData = await generateReportFromDescription({
    nathanDescription: body,
    jobTitle: job.title,
    client: job.client_name,
    siteAddress: job.site_address,
    workOrderRef: job.work_order_ref
  })

  const smsPrice = extractPrice(body)
  if (smsPrice > 0) reportData.price_ex_gst = smsPrice

  const smsEmail = extractEmail(body)
  const clientEmail = smsEmail || job.client_email
  const reportNumber = await getNextReportNumber()
  const today = new Date()

  await query(
    `INSERT INTO reports (report_number, job_id, client_id, title, task_information,
     investigation_findings, work_undertaken, remedial_action, recommended_followup,
     price_ex_gst, conducted_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')`,
    [reportNumber, job.id, job.client_id, reportData.title, reportData.task_information,
     reportData.investigation_findings, reportData.work_undertaken, reportData.remedial_action,
     reportData.recommended_followup, reportData.price_ex_gst, today]
  )

  const reportPDF = await generateReportPDF({ photos,
    report_number: reportNumber, conducted_on: formatDateLong(today),
    title: reportData.title, status: 'Completed',
    site_location: job.site_address, work_order: job.work_order_ref || job.job_number,
    client: job.client_name, contact: job.agency_contact || '',
    date_completed: formatDate(today),
    task_information: reportData.task_information,
    investigation_findings: reportData.investigation_findings,
    work_undertaken: reportData.work_undertaken,
    remedial_action: reportData.remedial_action,
    recommended_followup: reportData.recommended_followup,
    price_ex_gst: reportData.price_ex_gst
  })

  const invoiceNumber = await getNextInvoiceNumber()
  const lineItems = reportData.price_ex_gst > 0
    ? [{ description: reportData.title, qty: 1, rate: reportData.price_ex_gst }]
    : [{ description: job.title, qty: 1, rate: 0 }]
  const { lineItems: calcItems, subtotal, gst, total } = calculateLineItems(lineItems)

  await query(
    `INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8)`,
    [invoiceNumber, job.id, job.client_id, JSON.stringify(calcItems), subtotal, gst, total,
     new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
  )

  const invoicePDF = await generateInvoicePDF({
    invoice_number: invoiceNumber, date: formatDate(today),
    bill_to_name: job.client_name, bill_to_address: job.site_address,
    line_items: calcItems, subtotal, gst, total
  })

  await query("UPDATE jobs SET status='completed', completed_date=$1, updated_at=NOW() WHERE id=$2", [today, job.id])

  if (clientEmail) {
    if (smsEmail && smsEmail !== job.client_email) {
      await query("UPDATE clients SET email=$1 WHERE id=$2", [smsEmail, job.client_id])
    }
    await sendEmail({
      to: clientEmail,
      subject: `Service Report & Invoice - ${reportData.title} - ${reportNumber}`,
      body: buildEmailHTML(`
        <p>Hi ${job.agency_contact || job.client_name},</p>
        <p>Please find attached the completed service report and invoice.</p>
        <p><strong>${reportData.title}</strong><br>
        Site: ${job.site_address}<br>
        ${job.work_order_ref ? `Work Order: ${job.work_order_ref}<br>` : ''}
        Report: ${reportNumber} | Invoice: ${invoiceNumber}</p>
        <p>Total: $${total.toFixed(2)} inc GST</p>
        <p>Nathan<br>${BUSINESS.phone}<br>${BUSINESS.name}</p>
      `),
      attachments: [
        { filename: `${reportNumber}_Service_Report.pdf`, content: reportPDF, contentType: 'application/pdf' },
        { filename: `Invoice_${invoiceNumber}.pdf`, content: invoicePDF, contentType: 'application/pdf' }
      ]
    })
    await query("UPDATE reports SET status='sent', sent_at=NOW() WHERE report_number=$1", [reportNumber])
    await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invoiceNumber])
    await replyTo(from, `Done!\nReport: ${reportNumber}\nInvoice: ${invoiceNumber} ($${total.toFixed(2)} inc GST)\nSent to: ${clientEmail}`)
  } else {
    await replyTo(from, `Done! Report ${reportNumber} + Invoice ${invoiceNumber} ($${total.toFixed(2)}) saved.\nNo email on file - reply with client email to send.`)
  }
}

export async function POST(req: NextRequest) {
  let from = '+61407180596'
  try {
    const formData = await req.formData()
    const body = formData.get('Body') as string
    from = formData.get('From') as string

    if (!AUTHORISED_NUMBERS.includes(from)) {
      return new NextResponse('<?xml version="1.0"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    await query(
      'INSERT INTO sms_log (direction, from_number, to_number, body) VALUES ($1, $2, $3, $4)',
      ['inbound', from, process.env.TWILIO_PHONE_NUMBER, body]
    )

    const intent = detectIntent(body)

    // CREATE intent
    if (intent === 'create') {
      const workOrderData = await processCreateWorkOrderSMS(body)
      if (workOrderData) {
        const clientId = await findOrCreateClient({ name: workOrderData.client, is_agency: false })
        const jobNumber = await getNextJobNumber()
        await query(
          `INSERT INTO jobs (job_number, client_id, title, description, site_address, status, source)
           VALUES ($1, $2, $3, $4, $5, 'pending', 'sms')`,
          [jobNumber, clientId, workOrderData.title, workOrderData.description, workOrderData.site_address]
        )
        await replyTo(from, `Work order ${jobNumber} created!\n"${workOrderData.title}"\nClient: ${workOrderData.client}\nSite: ${workOrderData.site_address}`)
      } else {
        await replyTo(from, `Couldn't create work order - try: "Create work order for [client] at [address] - [description]"`)
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // DRIVE intent
    if (intent === 'drive') {
      const job = await findJob(body)
      const clientEmail = extractEmail(body) || job?.client_email
      const price = extractPrice(body)

      await replyTo(from, `Searching Google Drive... give me a moment`)

      // Use AI to extract what to search for from the message
      const Anthropic = require('@anthropic-ai/sdk').default
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const today = new Date().toISOString().split('T')[0]

      const aiSearch = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Today is ${today}. Extract Google Drive search terms from this message.
Message: "${body}"
Return ONLY a JSON object with:
- terms: array of search strings to use (e.g. ["sheffield"] or ["345 test st"] or ["lavinia"])
- recentOnly: true if they said "today" or "uploaded today" or "just uploaded"
Return ONLY valid JSON.`
        }]
      })

      let searchTerms: string[] = []
      let recentOnly = false
      try {
        const aiText = aiSearch.content[0].type === 'text' ? aiSearch.content[0].text : '{}'
        const parsed = JSON.parse(aiText.replace(/\`\`\`json|\`\`\`/g, '').trim())
        searchTerms = parsed.terms || []
        recentOnly = parsed.recentOnly || false
      } catch {
        searchTerms = [extractStreetName(body)].filter(Boolean)
      }

      console.log('Drive search terms:', searchTerms, 'recentOnly:', recentOnly)

      const foundFiles: Array<{ file: any; buffer: Buffer }> = []

      for (const term of searchTerms) {
        if (!term) continue
        let files = await findAllInspectionReports(term)
        
        // If they said "today" or "uploaded today", filter to files modified today
        if (recentOnly) {
          const todayStart = new Date()
          todayStart.setHours(0, 0, 0, 0)
          files = files.filter((f: any) => {
            if (!f.modifiedTime) return true
            return new Date(f.modifiedTime) >= todayStart
          })
        }

        for (const file of files) {
          if (!foundFiles.find(f => f.file.id === file.id)) {
            const buffer = await downloadDriveFile(file.id)
            foundFiles.push({ file, buffer })
          }
        }
      }

      if (foundFiles.length === 0) {
        await replyTo(from, `Couldn't find any matching reports in Google Drive. Check the file names include the street name.`)
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      }

      if (clientEmail) {
        // Build attachments with sanitized filenames
        const attachments: Array<{ filename: string; content: Buffer; contentType: string }> =
          foundFiles.map(({ file, buffer }) => {
            let filename = (file.name as string).replace(/\//g, '-').replace(/\\/g, '-')
            if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf'
            return { filename, content: buffer, contentType: 'application/pdf' }
          })

        // Generate invoice if price mentioned
        let invoiceNote = ''
        if (price > 0) {
          const invoiceNumber = await getNextInvoiceNumber()

          // Use AI to extract line items from the message
          let lineItemsRaw: Array<{ description: string; qty: number; rate: number }> = []
          try {
            const lineItemAI = await anthropic.messages.create({
              model: 'claude-sonnet-4-5',
              max_tokens: 400,
              messages: [{
                role: 'user',
                content: 'Extract invoice line items from this message. Total ex GST must equal $' + price + '.\nMessage: "' + body + '"\nRules:\n- Every line item MUST have a non-zero rate\n- qty * rate must be > 0 for every row\n- All rates added up must equal ' + price + '\n- If multiple items mentioned, split the total proportionally\n- description should be clear and professional\nReturn ONLY a JSON array like: [{"description":"Electrical Inspection","qty":2,"rate":200},{"description":"Smoke Alarm Inspection","qty":1,"rate":80}]'
              }]
            })
            const aiText = lineItemAI.content[0].type === 'text' ? lineItemAI.content[0].text : '[]'
            lineItemsRaw = JSON.parse(aiText.replace(/```json|```/g, '').trim())
            // Validate - ensure no zero rates
            lineItemsRaw = lineItemsRaw.filter((item: any) => item.rate > 0 && item.qty > 0)
            if (lineItemsRaw.length === 0) throw new Error('No valid line items')
          } catch {
            lineItemsRaw = [{ description: 'Electrical Services', qty: 1, rate: price }]
          }

          const { lineItems, subtotal, gst, total } = calculateLineItems(lineItemsRaw)
          if (job) {
            await query(
              `INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8)`,
              [invoiceNumber, job.id, job.client_id, JSON.stringify(lineItems), subtotal, gst, total,
               new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
            )
          }
          const invPDF = await generateInvoicePDF({
            invoice_number: invoiceNumber, date: formatDate(new Date()),
            bill_to_name: job?.client_name || 'Client',
            bill_to_address: job?.site_address || '',
            line_items: lineItems, subtotal, gst, total
          })
          attachments.push({ filename: `Invoice_${invoiceNumber}.pdf`, content: invPDF, contentType: 'application/pdf' })
          if (job) await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invoiceNumber])
          invoiceNote = ` + Invoice ${invoiceNumber} ($${total.toFixed(2)} inc GST)`
        }

        const fileNames = foundFiles.map(f => f.file.name).join(', ')
        await sendEmail({
          to: clientEmail,
          subject: `Inspection Reports - ${extractStreetName(body) || 'Property'}`,
          body: buildEmailHTML(`
            <p>Hi,</p>
            <p>Please find attached the inspection report${foundFiles.length > 1 ? 's' : ''} as requested.</p>
            ${price > 0 ? `<p>Invoice included for $${(price * 1.1).toFixed(2)} inc GST, due within ${BUSINESS.payment_terms_days} days.</p>` : ''}
            <p>Nathan<br>${BUSINESS.phone}<br>${BUSINESS.name}</p>
          `),
          attachments
        })
        await replyTo(from, `Sent ${foundFiles.length} file${foundFiles.length > 1 ? 's' : ''}${invoiceNote} to ${clientEmail}\n${fileNames}`)
      } else {
        const fileNames = foundFiles.map(f => f.file.name).join(', ')
        await replyTo(from, `Found: ${fileNames}\nReply with client email to send.`)
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // CALENDAR intent
    if (intent === 'calendar') {
      const booking = await parseBookingFromSMS(body)
      if (!booking) {
        await replyTo(from, `I need a date to book this. Try: "Book electrical inspection at 45 Brown St for Monday 28 April at 9am"`)
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      }
      const job = await findJob(body)
      const event = await createCalendarEvent({
        title: booking.title, description: booking.description,
        location: booking.location || job?.site_address,
        startDate: booking.date, startTime: booking.time, jobNumber: job?.job_number
      })
      if (event) {
        if (job) {
          await query("UPDATE jobs SET scheduled_date=$1, status='active', updated_at=NOW() WHERE id=$2", [booking.date, job.id])
        }
        const dateStr = new Date(booking.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        await replyTo(from, `Booked! "${event.title}"\n${dateStr}${booking.time ? ' at ' + booking.time : ''}\nAdded to Google Calendar.`)
      } else {
        await replyTo(from, `Couldn't add to calendar - check Google Calendar API is enabled.`)
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // INVOICE ONLY intent - generate invoice without report
    if (intent === 'invoice_only') {
      const job = await findJob(body)
      const clientEmail = extractEmail(body) || job?.client_email
      const price = extractPrice(body)

      if (price === 0) {
        await replyTo(from, `What amount should I invoice? Include a dollar amount like $400.`)
        return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
      }

      // Extract custom email body if provided
      const Anthropic2 = require('@anthropic-ai/sdk').default
      const anthropic2 = new Anthropic2({ apiKey: process.env.ANTHROPIC_API_KEY })

      // Extract line items
      let lineItemsRaw: Array<{ description: string; qty: number; rate: number }> = []
      let customEmailBody = ''
      try {
        const invoiceAI = await anthropic2.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: 'From this message extract: 1) Invoice line items (total must = $' + price + ' ex GST), 2) Any custom email body content the sender wants included.\nMessage: "' + body + '"\nReturn ONLY JSON: {"lineItems": [{"description":"...","qty":1,"rate":0}], "emailBody": "custom message or empty string"}\nEvery line item must have rate > 0.'
          }]
        })
        const aiText = invoiceAI.content[0].type === 'text' ? invoiceAI.content[0].text : '{}'
        const parsed = JSON.parse(aiText.replace(/```json|```/g, '').trim())
        lineItemsRaw = (parsed.lineItems || []).filter((i: any) => i.rate > 0 && i.qty > 0)
        customEmailBody = parsed.emailBody || ''
        if (lineItemsRaw.length === 0) throw new Error('no items')
      } catch {
        lineItemsRaw = [{ description: 'Electrical Services', qty: 1, rate: price }]
      }

      const { lineItems, subtotal, gst, total } = calculateLineItems(lineItemsRaw)
      const invoiceNumber = await getNextInvoiceNumber()
      const today = new Date()

      if (job) {
        await query(
          `INSERT INTO invoices (invoice_number, job_id, client_id, line_items, subtotal, gst, total, status, due_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8)`,
          [invoiceNumber, job.id, job.client_id, JSON.stringify(lineItems), subtotal, gst, total,
           new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
        )
      }

      const invoicePDF = await generateInvoicePDF({
        invoice_number: invoiceNumber, date: formatDate(today),
        bill_to_name: job?.client_name || 'Client',
        bill_to_address: job?.site_address || '',
        line_items: lineItems, subtotal, gst, total
      })

      if (clientEmail) {
        const emailContent = customEmailBody
          ? `<p>${customEmailBody.replace(/
/g, '<br>')}</p>`
          : `<p>Please find attached invoice ${invoiceNumber} for $${total.toFixed(2)} inc GST.</p>`

        await sendEmail({
          to: clientEmail,
          subject: `Invoice ${invoiceNumber} - Tested Electrical`,
          body: buildEmailHTML(`
            ${emailContent}
            <p>Nathan<br>${BUSINESS.phone}<br>${BUSINESS.name}</p>
          `),
          attachments: [
            { filename: `Invoice_${invoiceNumber}.pdf`, content: invoicePDF, contentType: 'application/pdf' }
          ]
        })
        if (job) await query("UPDATE invoices SET status='sent', sent_at=NOW() WHERE invoice_number=$1", [invoiceNumber])
        await replyTo(from, `Invoice ${invoiceNumber} ($${total.toFixed(2)} inc GST) sent to ${clientEmail}`)
      } else {
        await replyTo(from, `Invoice ${invoiceNumber} ($${total.toFixed(2)} inc GST) saved. No email on file - reply with client email to send.`)
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // COMPLETE intent
    if (intent === 'complete') {
      const job = await findJob(body)
      if (job) {
        await replyTo(from, `Got it! Writing report + invoice for "${job.title}" at ${job.site_address}... 30 secs`)
        await generateAndSendReportInvoice(job, body, from)
      } else {
        await replyTo(from, `Couldn't find a matching job. Include the address or job number and try again.`)
      }
      return new NextResponse('<?xml version="1.0"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } })
    }

    // UNKNOWN - let AI decide
    const job = await findJob(body)
    const aiResponse = await processJobUpdateSMS(body, job ? {
      title: job.title, client: job.client_name,
      site: job.site_address, workOrderRef: job.work_order_ref
    } : undefined)

    if (aiResponse.action === 'generate_report' && job) {
      await replyTo(from, `Got it! Writing report + invoice for "${job.title}"... 30 secs`)
      await generateAndSendReportInvoice(job, body, from)
    } else {
      await replyTo(from, aiResponse.response || "Got it! Check the dashboard.")
    }

    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    })
  } catch (error: any) {
    console.error('SMS webhook error:', error)
    try { await sendSMS(from, 'Something went wrong. Check the dashboard.') } catch {}
    return new NextResponse('<?xml version="1.0"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}
