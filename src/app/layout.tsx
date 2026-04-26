'use client'
import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/dashboard/jobs', label: 'Jobs', icon: '🔧' },
  { href: '/dashboard/quotes', label: 'Quotes', icon: '📋' },
  { href: '/dashboard/invoices', label: 'Invoices', icon: '💰' },
  { href: '/dashboard/reports', label: 'Reports', icon: '📄' },
  { href: '/dashboard/clients', label: 'Clients', icon: '👥' },
]

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-[#1a1a1a] flex flex-col z-40
        transition-transform duration-200 ease-in-out
        lg:relative lg:translate-x-0 lg:w-56
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-[#F5C400] font-bold text-lg leading-tight">TESTED</div>
            <div className="text-white/50 text-xs mt-0.5">Electrical Admin</div>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/50 hover:text-white text-xl p-1">
            &#10005;
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(item => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
              || (item.href === '/dashboard' && pathname === '/dashboard')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
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
        <div className="px-5 py-4 border-t border-white/10">
          <div className="text-white/40 text-xs">Nathan · Solo operator</div>
          <div className="text-white/25 text-xs mt-0.5">REC: 32266 · Lic: A65280</div>
        </div>
      </aside>
    </>
  )
}

function MobileHeader({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="lg:hidden sticky top-0 z-20 bg-[#1a1a1a] flex items-center justify-between px-4 py-3">
      <button onClick={onOpen} className="text-white text-xl p-1">
        &#9776;
      </button>
      <div className="text-[#F5C400] font-bold text-sm">TESTED Electrical</div>
      <div className="w-8" />
    </div>
  )
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === '/' || pathname === '/login'
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  if (isLogin) return <>{children}</>

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileHeader onOpen={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto bg-[#f4f4f0]">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Tested Electrical — Admin</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#1a1a1a] text-white">Loading...</div>}>
          <LayoutContent>{children}</LayoutContent>
        </Suspense>
      </body>
    </html>
  )
}
