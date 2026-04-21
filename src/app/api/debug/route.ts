import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const db = await query('SELECT current_database(), current_schema(), version()')
    const jobs = await query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = $1) as pending FROM jobs', ['pending'])
    const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
    
    return NextResponse.json({
      connection: db.rows[0],
      jobs: jobs.rows[0],
      tables: tables.rows.map((r: any) => r.table_name),
      database_url_prefix: process.env.DATABASE_URL?.substring(0, 40) + '...'
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack })
  }
}
