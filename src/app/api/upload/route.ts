import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    // Create uploads table if needed
    await query(`CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`)

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const result = await query(
      'INSERT INTO uploads (filename, mime_type, data) VALUES ($1, $2, $3) RETURNING id, filename, mime_type',
      [file.name, file.type, base64]
    )

    const id = result.rows[0].id
    return NextResponse.json({ url: '/api/upload?id=' + id, type: file.type, filename: file.name })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 })

    const result = await query('SELECT filename, mime_type, data FROM uploads WHERE id = $1', [id])
    if (result.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { filename, mime_type, data } = result.rows[0]
    const buffer = Buffer.from(data, 'base64')

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mime_type,
        'Content-Disposition': 'inline; filename="' + filename + '"',
        'Cache-Control': 'public, max-age=31536000'
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
