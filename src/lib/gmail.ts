import { google } from 'googleapis'
import { BUSINESS } from './constants'

function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  auth.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  })
  return google.gmail({ version: 'v1', auth })
}

export async function getUnreadEmails() {
  const gmail = getGmailClient()
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults: 20
  })

  if (!res.data.messages) return []

  const emails = await Promise.all(
    res.data.messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full'
      })

      const headers = detail.data.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

      const subject = getHeader('Subject')
      const from = getHeader('From')
      const date = getHeader('Date')

      // Extract body
      let body = ''
      const payload = detail.data.payload
      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8')
      } else if (payload?.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64').toString('utf-8')
            break
          }
        }
      }

      // Get attachments info
      const attachments: Array<{filename: string, mimeType: string, attachmentId: string}> = []
      if (payload?.parts) {
        for (const part of payload.parts) {
          if (part.filename && part.body?.attachmentId) {
            attachments.push({
              filename: part.filename,
              mimeType: part.mimeType || '',
              attachmentId: part.body.attachmentId
            })
          }
        }
      }

      return {
        id: msg.id!,
        threadId: detail.data.threadId || '',
        subject,
        from,
        date,
        body,
        attachments,
        snippet: detail.data.snippet || ''
      }
    })
  )

  return emails
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const gmail = getGmailClient()
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId
  })
  return Buffer.from(res.data.data || '', 'base64url')
}

export async function markAsRead(messageId: string) {
  const gmail = getGmailClient()
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] }
  })
}

export async function sendEmail({
  to,
  cc,
  bcc,
  subject,
  body,
  attachments = []
}: {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
}) {
  const gmail = getGmailClient()

  const boundary = 'boundary_tested_electrical'
  let raw = [
    `From: ${BUSINESS.name} <${BUSINESS.email}>`,
    `To: ${to}`,
  ]
  if (cc) raw.push(`Cc: ${cc}`)
  if (bcc) raw.push(`Bcc: ${bcc}`)
  raw.push(
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  )

  for (const att of attachments) {
    raw.push(`--${boundary}`)
    raw.push(`Content-Type: ${att.contentType}`)
    raw.push(`Content-Transfer-Encoding: base64`)
    raw.push(`Content-Disposition: attachment; filename="${att.filename}"`)
    raw.push('')
    raw.push(att.content.toString('base64'))
  }

  raw.push(`--${boundary}--`)

  const encoded = Buffer.from(raw.join('\n')).toString('base64url')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded }
  })
}

export function buildEmailHTML(body: string): string {
  const logoUrl = (process.env.APP_URL || 'https://testedelectrical-production.up.railway.app') + '/logo.png'
  return `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; color: #333; font-size: 14px; line-height: 1.6; }
  .header { background: #1a56db; padding: 20px 30px; text-align: center; }
  .header img { max-width: 180px; height: auto; }
  .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 12px; }
  .content { padding: 30px; }
  .footer { background: #f5f5f5; padding: 15px 30px; font-size: 12px; color: #777; border-top: 1px solid #e5e5e5; }
</style>
</head>
<body>
<div class="header">
  <img src="${logoUrl}" alt="Tested Electrical" />
  <p>Electrical & Communications Services</p>
</div>
<div class="content">${body}</div>
<div class="footer">
  <p>${BUSINESS.name} | ABN: ${BUSINESS.abn} | REC: ${BUSINESS.rec}</p>
  <p>${BUSINESS.phone} | ${BUSINESS.email} | ${BUSINESS.address}</p>
</div>
</body>
</html>`
}
