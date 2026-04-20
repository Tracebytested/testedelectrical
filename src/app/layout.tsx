'use client'
import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/dashboard/jobs', label: 'Jobs', icon: '🔧' },
  { href: '/dashboard/quotes', label: 'Quotes', icon: '📋' },
  { href: '/dashboard/invoices', label: 'Invoices', icon: '💰' },
  { href: '/dashboard/reports', label: 'Reports', icon: '📄' },
  { href: '/dashboard/clients', label: 'Clients', icon: '👥' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === '/' || pathname === '/login'

  if (isLogin) {
    return (
      <html lang="en">
        <head><title>Tested Electrical</title></head>
        <body>{children}</body>
      </html>
    )
  }

  return (
    <html lang="en">
      <head><title>Tested Electrical — Admin</title></head>
      <body>
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar */}
          <aside className="w-56 flex-shrink-0 bg-[#1a1a1a] flex flex-col">
            {/* Logo */}
            <div className="px-5 py-5 border-b border-white/10">
              <div className="text-[#F5C400] font-bold text-lg leading-tight">TESTED</div>
              <div className="text-white/50 text-xs mt-0.5">Electrical Admin</div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1">
              {nav.map(item => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-[#F5C400] text-[#1a1a1a] font-semibold'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/* Bottom */}
            <div className="px-5 py-4 border-t border-white/10">
              <div className="text-white/40 text-xs">Nathan · Solo operator</div>
              <div className="text-white/25 text-xs mt-0.5">REC: 32266 · Lic: A65280</div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto bg-[#f4f4f0]">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
