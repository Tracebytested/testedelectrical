import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query('SELECT * FROM clients ORDER BY created_at DESC')
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const result = await query(
      'INSERT INTO clients (name, email, phone, address, company, is_agency, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [data.name, data.email, data.phone, data.address, data.company, data.is_agency || false, data.notes]
    )
    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
