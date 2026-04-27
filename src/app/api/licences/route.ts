import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS licences (
      id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(50) DEFAULT 'licence',
      licence_number VARCHAR(255), issue_date DATE, expiry_date DATE,
      no_expiry BOOLEAN DEFAULT false, image_url TEXT,
      reminder_sent_1month BOOLEAN DEFAULT false, reminder_sent_1week BOOLEAN DEFAULT false,
      notes TEXT, created_at TIMESTAMP DEFAULT NOW()
    )`)
    // Fix existing table constraints
    await query("ALTER TABLE licences ALTER COLUMN expiry_date DROP NOT NULL").catch(() => {})
    // Add columns if they don't exist (for existing tables)
    await query("ALTER TABLE licences ADD COLUMN IF NOT EXISTS issue_date DATE").catch(() => {})
    await query("ALTER TABLE licences ADD COLUMN IF NOT EXISTS no_expiry BOOLEAN DEFAULT false").catch(() => {})
    await query("ALTER TABLE licences ADD COLUMN IF NOT EXISTS image_url TEXT").catch(() => {})
    
    const result = await query('SELECT * FROM licences ORDER BY CASE WHEN no_expiry THEN 1 ELSE 0 END, expiry_date ASC NULLS LAST')
    return NextResponse.json(result.rows)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const result = await query(
      'INSERT INTO licences (name, type, licence_number, issue_date, expiry_date, no_expiry, image_url, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [data.name, data.type || 'licence', data.licence_number || null, data.issue_date || null,
       data.no_expiry ? null : (data.expiry_date || null), data.no_expiry || false, data.image_url || null, data.notes || null]
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
      'UPDATE licences SET name=$1, type=$2, licence_number=$3, issue_date=$4, expiry_date=$5, no_expiry=$6, image_url=$7, notes=$8 WHERE id=$9 RETURNING *',
      [data.name, data.type, data.licence_number, data.issue_date || null,
       data.no_expiry ? null : (data.expiry_date || null), data.no_expiry || false, data.image_url || null, data.notes, data.id]
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
