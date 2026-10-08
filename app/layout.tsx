'use client';

import './globals.css';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from './lib/supabase';
import {
  Building2,
  HandHeart,
  ShoppingBag,
  Sparkles,
  Truck,
  Image as ImageIcon,
  LayoutDashboard,
  ShieldAlert,
  Flag,
  Bike,
  LogOut,
  Loader2,
  Menu,
  X,
  Lock,
} from 'lucide-react';

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; badgeKey?: 'reports' | 'drivers' };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: 'Operasional',
    items: [
      { name: 'Ringkasan', href: '/', icon: LayoutDashboard },
      { name: 'Laporan Pengguna', href: '/laporan', icon: Flag, badgeKey: 'reports' },
    ],
  },
  {
    label: 'PimPim',
    items: [{ name: 'Driver Pim', href: '/drivers', icon: Bike, badgeKey: 'drivers' }],
  },
  {
    label: 'Layanan',
    items: [
      { name: 'Hunian (Kost & Sewa)', href: '/properties', icon: Building2 },
      { name: 'Sobat Tolongin', href: '/tolongin', icon: HandHeart },
      { name: 'Jual Beli Kost', href: '/kos-sales', icon: Building2 },
      { name: 'Preloved', href: '/preloved', icon: ShoppingBag },
      { name: 'Cleaning Service', href: '/cleaning', icon: Sparkles },
      { name: 'Jasa Angkut', href: '/angkut', icon: Truck },
    ],
  },
  {
    label: 'Keselamatan',
    items: [{ name: 'Relawan Siaga SOS', href: '/sos', icon: ShieldAlert }],
  },
  {
    label: 'Pemasaran',
    items: [{ name: 'Banner Promo', href: '/banners', icon: ImageIcon }],
  },
];

const allItems = navGroups.flatMap((g) => g.items);

function titleFor(pathname: string) {
  const exact = allItems.find((i) => i.href === pathname);
  if (exact) return exact.name;
  const prefix = allItems.find((i) => i.href !== '/' && pathname.startsWith(i.href));
  return prefix ? prefix.name : 'Konsol Admin';
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [openReports, setOpenReports] = useState(0);
  const [pendingDrivers, setPendingDrivers] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isLogin = pathname === '/login';

  useEffect(() => {
    let isMounted = true;

    async function checkUser() {
      if (pathname === '/login') {
        if (isMounted) {
          setCheckingAuth(false);
          setIsAuthenticated(false);
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) return;
      if (!session) {
        setIsAuthenticated(false);
        setCheckingAuth(false);
        router.replace('/login');
      } else {
        setEmail(session.user.email ?? '');
        setIsAuthenticated(true);
        setCheckingAuth(false);
      }
    }

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login') {
        setIsAuthenticated(false);
        router.replace('/login');
      } else if (session) {
        setEmail(session.user.email ?? '');
        setIsAuthenticated(true);
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  // Cek peran admin + jumlah laporan terbuka (untuk lencana menu)
  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;

    async function loadMeta() {
      const adminRes = await supabase.rpc('is_admin');
      if (isMounted && !adminRes.error) setIsAdmin(adminRes.data === true);

      const summary = await supabase.rpc('admin_report_summary');
      if (isMounted && !summary.error && summary.data) {
        setOpenReports(Number((summary.data as { open?: number }).open ?? 0));
      }

      const drv = await supabase.rpc('admin_driver_summary');
      if (isMounted && !drv.error && drv.data) {
        setPendingDrivers(Number((drv.data as { pending?: number }).pending ?? 0));
      }
    }

    loadMeta();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const initial = (email || 'A').charAt(0).toUpperCase();

  let content: React.ReactNode;

  if (isLogin) {
    content = children;
  } else if (checkingAuth) {
    content = (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <p className="text-xs text-slate-400 font-medium">Memeriksa izin akses admin...</p>
        </div>
      </div>
    );
  } else if (!isAuthenticated) {
    content = null;
  } else if (isAdmin === false) {
    content = (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
        <div className="max-w-sm w-full bg-white rounded-2xl p-7 text-center shadow-xl">
          <div className="w-12 h-12 mx-auto rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">Akun ini bukan admin</h1>
          <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
            {email} belum terdaftar sebagai admin Kamar Kita. Hubungi pemilik sistem untuk diberi akses.
          </p>
          <button
            onClick={handleLogout}
            className="mt-5 w-full py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
          >
            Keluar
          </button>
        </div>
      </div>
    );
  } else {
    const sidebar = (
      <div className="flex flex-col h-full">
        <div className="px-5 h-16 flex items-center gap-3 border-b border-white/5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-lg shadow-blue-900/40">
            K
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white tracking-tight">Kamar Kita</div>
            <div className="text-[11px] text-slate-400">Konsol Admin</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                  const badge = item.badgeKey === 'reports' ? openReports : item.badgeKey === 'drivers' ? pendingDrivers : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className={`group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-500/15 text-white'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                      }`}
                    >
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-blue-400" />}
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
                      <span className="flex-1 truncate">{item.name}</span>
                      {badge > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/5 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-100 text-xs font-bold flex items-center justify-center shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-200 truncate">{email || 'Admin'}</div>
              <div className="text-[11px] text-slate-500">Administrator</div>
            </div>
            <button
              onClick={handleLogout}
              title="Keluar"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );

    content = (
      <div className="min-h-screen flex">
        {/* Sidebar desktop */}
        <aside className="hidden lg:block w-64 shrink-0 bg-slate-950 border-r border-white/5 sticky top-0 h-screen">
          {sidebar}
        </aside>

        {/* Sidebar mobile */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <aside className="relative w-72 max-w-[85%] bg-slate-950 h-full shadow-2xl">
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-4 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-white/10"
                aria-label="Tutup menu"
              >
                <X className="w-4 h-4" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 h-16 bg-white/85 backdrop-blur border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 font-medium">Konsol Admin</div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate -mt-0.5">
                {titleFor(pathname)}
              </h1>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Production
              </span>
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                {initial}
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <html lang="id">
      <body className={isLogin ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900 antialiased'}>
        {content}
      </body>
    </html>
  );
}