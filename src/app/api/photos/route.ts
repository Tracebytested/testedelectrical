import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getRecentJobPhotos } from '@/lib/drive'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('job_id')

    if (!jobId) return NextResponse.json([])

    const jobResult = await query('SELECT site_address FROM jobs WHERE id = $1', [jobId])
    if (jobResult.rows.length === 0) return NextResponse.json([])

    const address = jobResult.rows[0].site_address
    if (!address) return NextResponse.json([])

    const photos = await getRecentJobPhotos(address)

    // Return Google Drive thumbnail URLs
    const urls = photos.map((p: any) =>
      'https://drive.google.com/thumbnail?id=' + p.id + '&sz=w400'
    )

    return NextResponse.json(urls)
  } catch (error: any) {
    return NextResponse.json([])
  }
}
