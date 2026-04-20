import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (password === process.env.DASHBOARD_PASSWORD) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set('auth', process.env.DASHBOARD_PASSWORD!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })
    return res
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
