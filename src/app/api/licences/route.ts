import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS licences (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) DEFAULT 'licence',
      licence_number VARCHAR(255), expiry_date DATE NOT NULL,
      reminder_sent_1month BOOLEAN DEFAULT false, reminder_sent_1week BOOLEAN DEFAULT false,
      notes TEXT, created_at TIMESTAMP DEFAULT NOW()
    )`)
    const result = await query('SELECT * FROM licences ORDER BY expiry_date ASC')
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const result = await query(
      'INSERT INTO licences (name, type, licence_number, expiry_date, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [data.name, data.type || 'licence', data.licence_number || null, data.expiry_date, data.notes || null]
    )
    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const data = await req.json()
    const result = await query(
      'UPDATE licences SET name=$1, type=$2, licence_number=$3, expiry_date=$4, notes=$5 WHERE id=$6 RETURNING *',
      [data.name, data.type, data.licence_number, data.expiry_date, data.notes, data.id]
    )
    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    await query('DELETE FROM licences WHERE id = $1', [id])
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
