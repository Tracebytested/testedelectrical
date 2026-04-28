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
// Returns most recently modified matching file
export async function findInspectionReport(address: string): Promise<{
  id: string
  name: string
  mimeType: string
} | null> {
  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })
    
    // Try progressively shorter search terms
    const searchTerms = [
      address.split(' ').slice(0, 3).join(' '),  // e.g. "61 Sheffield St"
      address.split(' ').slice(0, 2).join(' '),  // e.g. "61 Sheffield"  
      address.split(' ')[0],                       // e.g. "61" or "Sheffield"
    ]

    // Also extract just the street name (skip number)
    const words = address.split(' ')
    if (words.length > 1) {
      searchTerms.push(words[1]) // e.g. "Sheffield"
    }

    for (const term of searchTerms) {
      if (!term || term.length < 3) continue
      
      // Search in root and all locations
      const res = await drive.files.list({
        q: `name contains '${term}' and trashed = false`,
        fields: 'files(id, name, mimeType, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 50
      })

      const files = (res.data.files || []).filter((f: any) => 
        f.mimeType === 'application/pdf' || 
        (f.name && (f.name.toLowerCase().endsWith('.pdf') || f.name.includes('Electrical') || f.name.includes('Smoke')))
      )
      
      if (files.length > 0) {
        return files[0] as any
      }
    }

    return null
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
        fields: 'files(id, name, mimeType, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 50
      })
      if ((nameRes.data.files || []).length > 0) {
        return nameRes.data.files as any[]
      }
    }

    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 50
    })

    return (res.data.files || []) as any[]
  } catch (error) {
    console.error('Drive photos error:', error)
    return []
  }
}



// Find a specific unit's report - e.g. "unit 1" at "Sheffield"
export async function findUnitReport(unitNumber: string, streetName: string): Promise<{
  id: string
  name: string
  mimeType: string
} | null> {
  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })
    
    // Search by street name to get all matching files
    const res = await drive.files.list({
      q: `name contains '${streetName}' and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 20
    })

    const files = (res.data.files || []).filter((f: any) => 
      f.mimeType === 'application/pdf' || 
      f.name?.toLowerCase().endsWith('.pdf') ||
      f.name?.includes('Electrical') || 
      f.name?.includes('Smoke')
    )

    console.log('findUnitReport: unit=' + unitNumber + ' street=' + streetName + ' found ' + files.length + ' files:', files.map((f: any) => f.name))

    // Match patterns for unit number in filename:
    // "Unit 1, 61 Sheffield..." or "1/61 Sheffield..." or "1-61 Sheffield..." or "Unit-1" etc
    const unitPatterns = [
      new RegExp(`unit\s*${unitNumber}[,\s]`, 'i'),  // "Unit 1," or "Unit1 "
      new RegExp(`^${unitNumber}[/,\s-]`, 'i'),        // "1/" or "1," or "1-" at start
      new RegExp(`unit.?${unitNumber}`, 'i'),            // "Unit1" anywhere
      new RegExp(`\b${unitNumber}[/,]`, 'i'),           // "1/" or "1," anywhere
    ]

    for (const pattern of unitPatterns) {
      const match = files.find((f: any) => pattern.test(f.name || ''))
      if (match) {
        console.log('findUnitReport matched:', match.name)
        return match as any
      }
    }

    console.log('findUnitReport: no unit-specific match found')
    return null
  } catch (error) {
    console.error('Drive unit search error:', error)
    return null
  }
}

// Find all PDFs in Drive matching a search term - simple and direct
export async function findAllInspectionReports(searchTerm: string): Promise<Array<{
  id: string
  name: string
  mimeType: string
}>> {
  try {
    const drive = google.drive({ version: 'v3', auth: getAuth() })
    const res = await drive.files.list({
      q: `name contains '${searchTerm}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 50
    })
    const files = (res.data.files || []) as any[]
    console.log('Drive search "' + searchTerm + '" returned:', files.map((f: any) => f.name))
    return files
  } catch (error) {
    console.error('Drive search error:', error)
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
