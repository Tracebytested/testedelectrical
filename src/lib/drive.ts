import { google } from 'googleapis'

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return auth
}

// Search Google Drive for a file matching an address
export async function findInspectionReport(address: string): Promise<{
  id: string
  name: string
  mimeType: string
} | null> {
  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })

    // Extract key parts of address for searching
    // e.g. "58 Lavinia St Greenvale" -> search "58 Lavinia"
    const addressParts = address.split(' ').slice(0, 3).join(' ')

    const res = await drive.files.list({
      q: `name contains '${addressParts}' and mimeType = 'application/pdf' and trashed = false`,
      fields: 'files(id, name, mimeType)',
      orderBy: 'modifiedTime desc',
      pageSize: 5
    })

    const files = res.data.files || []
    if (files.length === 0) {
      // Try with just the street number and name
      const shortAddress = address.split(' ').slice(0, 2).join(' ')
      const res2 = await drive.files.list({
        q: `name contains '${shortAddress}' and mimeType = 'application/pdf' and trashed = false`,
        fields: 'files(id, name, mimeType)',
        orderBy: 'modifiedTime desc',
        pageSize: 5
      })
      const files2 = res2.data.files || []
      return files2.length > 0 ? files2[0] as any : null
    }

    return files[0] as any
  } catch (error) {
    console.error('Drive search error:', error)
    return null
  }
}

// Download a file from Google Drive as a buffer
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const drive = google.drive({ version: 'v3', auth: getAuth() })
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(res.data as ArrayBuffer)
}

// List recent inspection reports from Drive
export async function listRecentReports(limit = 10): Promise<Array<{
  id: string
  name: string
  modifiedTime: string
}>> {
  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })
    const res = await drive.files.list({
      q: `mimeType = 'application/pdf' and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: limit
    })
    return (res.data.files || []) as any[]
  } catch {
    return []
  }
}
