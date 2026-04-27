import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

    const ext = file.name.split('.').pop() || 'jpg'
    const filename = Date.now() + '-' + Math.random().toString(36).substring(7) + '.' + ext
    fs.writeFileSync(path.join(uploadsDir, filename), buffer)

    return NextResponse.json({ url: '/uploads/' + filename, type: file.type })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
