import { google } from 'googleapis'

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  )
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return auth
}

// Search Google Drive root for a PDF matching an address
export async function findInspectionReport(address: string): Promise<{
  id: string
  name: string
  mimeType: string
} | null> {
  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })
    const addressParts = address.split(' ').slice(0, 3).join(' ')

    const res = await drive.files.list({
      q: `name contains '${addressParts}' and mimeType = 'application/pdf' and trashed = false and 'root' in parents`,
      fields: 'files(id, name, mimeType)',
      orderBy: 'modifiedTime desc',
      pageSize: 5
    })

    const files = res.data.files || []
    if (files.length === 0) {
      const shortAddress = address.split(' ').slice(0, 2).join(' ')
      const res2 = await drive.files.list({
        q: `name contains '${shortAddress}' and mimeType = 'application/pdf' and trashed = false`,
        fields: 'files(id, name, mimeType)',
        orderBy: 'modifiedTime desc',
        pageSize: 5
      })
      const files2 = res2.data.files || []
      return files2.length > 0 ? (files2[0] as any) : null
    }

    return files[0] as any
  } catch (error) {
    console.error('Drive search error:', error)
    return null
  }
}

// Get recent job photos from Work Images folder (last 48 hours)
export async function getRecentJobPhotos(addressHint?: string): Promise<Array<{
  id: string
  name: string
  mimeType: string
}>> {
  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })

    // Find the Work Images folder
    const folderRes = await drive.files.list({
      q: `name = 'Work Images' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)'
    })

    const folders = folderRes.data.files || []
    if (folders.length === 0) {
      console.log('Work Images folder not found')
      return []
    }

    const folderId = folders[0].id

    // Get images from last 48 hours
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    let query = `'${folderId}' in parents and trashed = false and modifiedTime > '${cutoff}' and (mimeType contains 'image/' or name contains '.jpg' or name contains '.jpeg' or name contains '.png')`

    // If address hint provided, also try to match by filename
    if (addressHint) {
      const shortAddr = addressHint.split(' ').slice(0, 2).join(' ')
      const nameQuery = `'${folderId}' in parents and trashed = false and name contains '${shortAddr}' and (mimeType contains 'image/' or name contains '.jpg')`
      const nameRes = await drive.files.list({
        q: nameQuery,
        fields: 'files(id, name, mimeType)',
        orderBy: 'modifiedTime desc',
        pageSize: 10
      })
      if ((nameRes.data.files || []).length > 0) {
        return nameRes.data.files as any[]
      }
    }

    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType)',
      orderBy: 'modifiedTime desc',
      pageSize: 10
    })

    return (res.data.files || []) as any[]
  } catch (error) {
    console.error('Drive photos error:', error)
    return []
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

// List recent inspection reports from Drive root
export async function listRecentReports(limit = 10): Promise<Array<{
  id: string
  name: string
  modifiedTime: string
}>> {
  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })
    const res = await drive.files.list({
      q: `mimeType = 'application/pdf' and trashed = false and 'root' in parents`,
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: limit
    })
    return (res.data.files || []) as any[]
  } catch {
    return []
  }
}
