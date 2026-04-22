import PDFDocument from 'pdfkit'
import { BUSINESS } from './constants'
import path from 'path'
import fs from 'fs'

interface LineItem {
  description: string
  qty: number
  rate: number
  amount: number
  gst: number
  subtotal: number
}

interface InvoiceData {
  invoice_number: string
  date: string
  bill_to_name: string
  bill_to_address?: string
  line_items: LineItem[]
  subtotal: number
  gst: number
  total: number
}

interface QuoteData {
  quote_number: string
  date: string
  quote_to_name: string
  quote_to_address?: string
  line_items: LineItem[]
  subtotal: number
  gst: number
  total: number
  notes?: string[]
}

interface ReportData {
  report_number: string
  conducted_on: string
  title: string
  status: string
  site_location: string
  work_order: string
  client: string
  contact: string
  date_completed: string
  task_information: string
  investigation_findings: string
  work_undertaken: string
  remedial_action: string
  recommended_followup: string
  price_ex_gst: number
}

function getLogoPath(): string | null {
  const logoPath = path.join(process.cwd(), 'public', 'logo.png')
  return fs.existsSync(logoPath) ? logoPath : null
}

function addHeader(doc: any, title: string, docNumber: string, date: string, labelPrefix: string) {
  const logoPath = getLogoPath()

  // Logo
  if (logoPath) {
    doc.image(logoPath, 40, 30, { width: 120 })
  } else {
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a1a').text('TESTED', 40, 35)
    doc.fontSize(9).font('Helvetica').fillColor('#555').text('Electrical & Communications Services', 40, 55)
  }

  // Title (top right, blue like template)
  doc.fontSize(32).font('Helvetica-Bold').fillColor('#1a56db').text(title, 0, 35, { align: 'right', width: 555 })

  // Number/date box
  const boxX = 380
  const boxY = 75
  const boxW = 175

  doc.rect(boxX, boxY, boxW, 22).fillAndStroke('#1a56db', '#1a56db')
  doc.fontSize(9).font('Helvetica-Bold').fillColor('white')
    .text(`${labelPrefix} #`, boxX + 5, boxY + 7, { width: 85, align: 'left' })
    .text('DATE', boxX + 90, boxY + 7, { width: 80, align: 'left' })

  doc.rect(boxX, boxY + 22, boxW, 20).fillAndStroke('#f9fafb', '#d1d5db')
  doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a')
    .text(docNumber, boxX + 5, boxY + 29, { width: 85, align: 'left' })
    .text(date, boxX + 90, boxY + 29, { width: 80, align: 'left' })

  return 120 // return Y position after header
}

function addBusinessDetails(doc: any, y: number) {
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1a1a')
    .text(BUSINESS.name, 350, y)
  doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a')
    .text(`ABN: ${BUSINESS.abn}`, 350, y + 12)
    .text(`ACN: ${BUSINESS.acn}`, 350, y + 24)
    .text(`PHONE: ${BUSINESS.phone}`, 350, y + 36)
    .text(`EMAIL: ${BUSINESS.email}`, 350, y + 48)
    .text(`ADDRESS: ${BUSINESS.address}`, 350, y + 60)
}

function addLineItemsTable(doc: any, items: LineItem[], startY: number): number {
  const cols = { desc: 40, qty: 300, rate: 350, amount: 400, gst: 460, subtotal: 510 }
  const colWidths = { desc: 260, qty: 50, rate: 50, amount: 60, gst: 50, subtotal: 65 }

  // Header row
  doc.rect(40, startY, 515, 20).fillAndStroke('#1a56db', '#1a56db')
  doc.fontSize(8).font('Helvetica-Bold').fillColor('white')
  doc.text('DESCRIPTION', cols.desc + 2, startY + 6)
  doc.text('QTY', cols.qty, startY + 6, { width: colWidths.qty, align: 'center' })
  doc.text('RATE', cols.rate, startY + 6, { width: colWidths.rate, align: 'center' })
  doc.text('AMOUNT', cols.amount, startY + 6, { width: colWidths.amount, align: 'center' })
  doc.text('GST', cols.gst, startY + 6, { width: colWidths.gst, align: 'center' })
  doc.text('SUB TOTAL', cols.subtotal, startY + 6, { width: colWidths.subtotal, align: 'right' })

  let y = startY + 20

  // Line items
  items.forEach((item, i) => {
    const bg = i % 2 === 0 ? 'white' : '#f9fafb'
    const rowH = 22
    doc.rect(40, y, 515, rowH).fillAndStroke(bg, '#e5e7eb')
    doc.fontSize(8).font('Helvetica').fillColor('#1a1a1a')
    doc.text(item.description, cols.desc + 2, y + 7, { width: colWidths.desc - 4 })
    doc.text(item.qty.toString(), cols.qty, y + 7, { width: colWidths.qty, align: 'center' })
    doc.text(`$${item.rate.toFixed(2)}`, cols.rate, y + 7, { width: colWidths.rate, align: 'center' })
    doc.text(`$${item.amount.toFixed(2)}`, cols.amount, y + 7, { width: colWidths.amount, align: 'center' })
    doc.text(`$${item.gst.toFixed(2)}`, cols.gst, y + 7, { width: colWidths.gst, align: 'center' })
    doc.text(`$${item.subtotal.toFixed(2)}`, cols.subtotal, y + 7, { width: colWidths.subtotal, align: 'right' })
    y += rowH
  })

  // Empty rows to pad table
  const minRows = 5
  const extraRows = Math.max(0, minRows - items.length)
  for (let i = 0; i < extraRows; i++) {
    doc.rect(40, y, 515, 22).fillAndStroke('white', '#e5e7eb')
    y += 22
  }

  return y
}

function addTotalsRow(doc: any, y: number, subtotal: number, gst: number, total: number, leftLabel = 'Thank you for your business!') {
  doc.rect(40, y, 515, 24).fillAndStroke('#f3f4f6', '#d1d5db')
  doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6b7280')
    .text(leftLabel, 45, y + 8, { width: 250 })
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1a1a')
    .text('TOTAL', 330, y + 8, { width: 70, align: 'right' })
    .text(`$${subtotal.toFixed(2)}`, 400, y + 8, { width: 60, align: 'center' })
    .text(`$${gst.toFixed(2)}`, 460, y + 8, { width: 50, align: 'center' })
    .text(`$${total.toFixed(2)}`, 510, y + 8, { width: 45, align: 'right' })
  return y + 24
}

export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    addHeader(doc, 'INVOICE', data.invoice_number, data.date, 'INVOICE')

    // Bill To box
    doc.rect(40, 130, 200, 14).fillAndStroke('#1a56db', '#1a56db')
    doc.fontSize(8).font('Helvetica-Bold').fillColor('white').text('BILL TO', 45, 134)
    doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a')
      .text(data.bill_to_name, 40, 148)
    if (data.bill_to_address) {
      data.bill_to_address.split('\n').forEach((line, i) => {
        doc.text(line, 40, 160 + (i * 12))
      })
    }

    // Business details (right side)
    addBusinessDetails(doc, 130)

    // Line items table
    const tableY = 220
    const afterTable = addLineItemsTable(doc, data.line_items, tableY)

    // Totals
    const afterTotals = addTotalsRow(doc, afterTable, data.subtotal, data.gst, data.total)

    // Payment info - check if enough space, add new page if needed
    // Payment section needs ~180px, footer needs 60px
    const paymentHeight = 185
    let py = afterTotals + 20
    if (py + paymentHeight > doc.page.height - 80) {
      doc.addPage()
      py = 40
    }
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1a1a').text('PAYMENT INFORMATION', 40, py)
    py += 12
    doc.fontSize(8).font('Helvetica').fillColor('#1a1a1a')
      .text(`Bank Transfer, PayID, Credit Card or Cash Accepted`, 40, py)
    py += 11
    doc.text(`Bank: ${BUSINESS.bank.name}`, 40, py)
    py += 11
    doc.text(BUSINESS.bank.account_name, 40, py)
    py += 11
    doc.text(`BSB: ${BUSINESS.bank.bsb}`, 40, py)
    py += 11
    doc.text(`ACC NO: ${BUSINESS.bank.account}`, 40, py)
    py += 11
    doc.text(`Alternatively, You can Pay ID: ${BUSINESS.bank.payid}`, 40, py)
    py += 14
    doc.font('Helvetica-Bold').text('Please Quote Invoice Number On Transaction Reference', 40, py)
    py += 14
    doc.font('Helvetica').text(`Please note: Payment transfers Must be paid within ${BUSINESS.payment_terms_days} Days unless stated otherwise.`, 40, py)
    py += 11
    doc.text('Late Payment Fees Apply. View more information at', 40, py)
    py += 11
    doc.fillColor('#1a56db').text(BUSINESS.terms_url, 40, py)

    // Footer - on same page as payment info
    py += 20
    doc.moveTo(40, py).lineTo(555, py).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
    py += 10
    doc.fontSize(8).font('Helvetica').fillColor('#1a1a1a')
      .text(`If you have any questions about this invoice, please contact`, 40, py, { align: 'center', width: 515 })
    doc.text(`Nathan – ${BUSINESS.phone} - ${BUSINESS.email}`, 40, py + 12, { align: 'center', width: 515 })
    doc.text(`REC: ${BUSINESS.rec}`, 40, py + 24, { align: 'center', width: 515 })

    doc.end()
  })
}

export async function generateQuotePDF(data: QuoteData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    addHeader(doc, 'QUOTE', data.quote_number, data.date, 'QUOTE')

    // Quote To
    doc.rect(40, 130, 200, 14).fillAndStroke('#d1d5db', '#d1d5db')
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#1a1a1a').text('QUOTE TO', 45, 134)
    doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a')
      .text(data.quote_to_name, 40, 148)
    if (data.quote_to_address) {
      data.quote_to_address.split('\n').forEach((line, i) => {
        doc.text(line, 40, 160 + (i * 12))
      })
    }

    // Please note box (right side, like template)
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#1a1a1a').text('Please Note:', 350, 130)
    doc.font('Helvetica').text('If you can provide a cheaper quote we will try match it.', 350, 142, { width: 205 })
    doc.text('Terms & Conditions apply and are available at:', 350, 166, { width: 205 })
    doc.fillColor('#1a56db').text(BUSINESS.terms_url, 350, 178, { width: 205 })

    // Table
    const tableY = 220
    const afterTable = addLineItemsTable(doc, data.line_items, tableY)

    // Notes section
    let notesY = afterTable + 5
    if (data.notes && data.notes.length > 0) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a1a1a').text('*Notes', 45, notesY)
      notesY += 12
      data.notes.forEach(note => {
        doc.font('Helvetica').text(`- ${note}`, 45, notesY)
        notesY += 12
      })
    }

    // Totals with valid notice
    const totalsY = Math.max(notesY + 10, afterTable)
    const afterTotals = addTotalsRow(
      doc, totalsY, data.subtotal, data.gst, data.total,
      `Please Note; Quote Valid for ${BUSINESS.quote_valid_days} days from issue unless stated otherwise`
    )

    // Footer
    const footerY = doc.page.height - 70
    doc.fontSize(8).font('Helvetica').fillColor('#1a1a1a')
      .text('Please view our terms and conditions at Prior to Accepting', 40, footerY, { align: 'center', width: 515 })
    doc.fillColor('#1a56db').text(BUSINESS.terms_url, 40, footerY + 12, { align: 'center', width: 515 })
    doc.fillColor('#1a1a1a').text('If you have any questions about this Quote Please Contact', 40, footerY + 28, { align: 'center', width: 515 })
    doc.text(`Nathan – ${BUSINESS.phone} – ${BUSINESS.email}`, 40, footerY + 40, { align: 'center', width: 515 })
    doc.text(`REC: ${BUSINESS.rec}`, 40, footerY + 52, { align: 'center', width: 515 })

    doc.end()
  })
}

export async function generateReportPDF(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const logoPath = getLogoPath()

    // Header bar
    doc.rect(40, 30, 515, 85).fillAndStroke('white', '#e5e7eb')

    if (logoPath) {
      doc.image(logoPath, 50, 35, { width: 70 })
    }

    // Business name (blue, bold)
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a56db').text(BUSINESS.name, 130, 35)
    doc.fontSize(8).font('Helvetica').fillColor('#555')
      .text(BUSINESS.tagline, 130, 52)
      .text(BUSINESS.address, 130, 62)
      .text(`${BUSINESS.phone} · ${BUSINESS.email}`, 130, 72)
      .text(`ABN ${BUSINESS.abn} · REC: ${BUSINESS.rec}`, 130, 82)

    // SERVICE REPORT title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a1a1a')
      .text('SERVICE REPORT', 350, 35, { width: 200, align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor('#555')
      .text(data.report_number, 350, 58, { width: 200, align: 'right' })
    doc.text('CONDUCTED ON', 350, 72, { width: 200, align: 'right' })
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a')
      .text(data.conducted_on, 350, 84, { width: 200, align: 'right' })

    // Divider
    doc.moveTo(40, 120).lineTo(555, 120).strokeColor('#e5e7eb').lineWidth(1).stroke()

    // Report title section
    let y = 130
    doc.fontSize(8).font('Helvetica').fillColor('#6b7280').text('REPORT TITLE', 40, y)
    y += 10
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a1a1a').text(data.title, 40, y)
    y += 26

    // Status badge
    doc.rect(40, y, 75, 18).fillAndStroke('#d1fae5', '#6ee7b7')
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#065f46').text(`✓ ${data.status}`, 44, y + 5)
    y += 30

    doc.moveTo(40, y).lineTo(555, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
    y += 12

    // Two-column info grid
    const col1 = 40, col2 = 300
    const infoItems = [
      ['SITE', 'TECHNICIAN'],
      ['LOCATION', data.site_location, 'PREPARED BY', `${BUSINESS.technician} (Lic. ${BUSINESS.licence})`],
      ['WORK ORDER', data.work_order, 'DATE COMPLETED', data.date_completed],
      ['CLIENT', data.client, 'REPORT ID', data.report_number],
      ['CONTACT', data.contact, '', ''],
    ]

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280')
      .text('SITE', col1, y)
      .text('TECHNICIAN', col2, y)
    y += 12

    doc.moveTo(40, y).lineTo(555, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
    y += 8

    const infoRows = [
      { left: ['LOCATION', data.site_location], right: ['PREPARED BY', `${BUSINESS.technician} (Lic. ${BUSINESS.licence})`] },
      { left: ['WORK ORDER', data.work_order], right: ['DATE COMPLETED', data.date_completed] },
      { left: ['CLIENT', data.client], right: ['REPORT ID', data.report_number] },
      { left: ['CONTACT', data.contact], right: null },
    ]

    infoRows.forEach(row => {
      doc.fontSize(7).font('Helvetica').fillColor('#9ca3af').text(row.left[0], col1, y)
      if (row.right) doc.text(row.right[0], col2, y)
      y += 10
      doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a').text(row.left[1], col1, y, { width: 240 })
      if (row.right) doc.text(row.right[1], col2, y, { width: 240 })
      y += 18
      doc.moveTo(40, y).lineTo(555, y).strokeColor('#f3f4f6').lineWidth(0.5).stroke()
      y += 6
    })

    y += 6
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#e5e7eb').lineWidth(1).stroke()
    y += 12

    // Investigation section
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a56db').text('INVESTIGATION', 40, y)
    y += 14
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
    y += 8

    const sections = [
      { label: 'TASK INFORMATION', text: data.task_information },
      { label: 'INVESTIGATION FINDINGS', text: data.investigation_findings },
      { label: 'WORK UNDERTAKEN', text: data.work_undertaken },
      { label: 'REMEDIAL ACTION', text: data.remedial_action },
      { label: 'RECOMMENDED FOLLOW UP', text: data.recommended_followup },
    ]

    sections.forEach(section => {
      if (y > 720) { doc.addPage(); y = 40 }
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text(section.label, 40, y)
      y += 12
      doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a').text(section.text, 40, y, { width: 515 })
      y += doc.heightOfString(section.text, { width: 515 }) + 16
    })

    // Cost section
    if (y > 700) { doc.addPage(); y = 40 }
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#e5e7eb').lineWidth(1).stroke()
    y += 10
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1a56db').text('COST', 40, y)
    y += 14
    doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a')
      .text(`Price (ex GST)`, 40, y)
      .text(`$${data.price_ex_gst.toFixed(2)}`, 200, y)
    y += 20

    // Sign off
    doc.text(`CONDUCTED BY`, 40, y)
    y += 12
    doc.font('Helvetica-Bold').text(`${BUSINESS.technician} (Lic. ${BUSINESS.licence})`, 40, y)
    y += 12
    doc.font('Helvetica').text(`SIGN-OFF DATE`, 40, y)
    y += 12
    doc.text(data.date_completed, 40, y)

    // Page footer
    const fy = doc.page.height - 35
    doc.moveTo(40, fy - 10).lineTo(555, fy - 10).strokeColor('#e5e7eb').lineWidth(0.5).stroke()
    doc.fontSize(7.5).font('Helvetica').fillColor('#6b7280')
      .text(
        `${BUSINESS.name} · ${BUSINESS.email} · ${BUSINESS.phone} · ABN ${BUSINESS.abn} · License REC: ${BUSINESS.rec}`,
        40, fy, { align: 'center', width: 515 }
      )

    doc.end()
  })
}
