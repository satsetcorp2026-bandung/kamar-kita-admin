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
  Route,
  Siren,
  TrendingUp,
  Wallet,
  MapPin,
  SlidersHorizontal,
  Gauge,
  History,
  Search,
  LogOut,
  Loader2,
  Menu,
  X,
  Lock,
} from 'lucide-react';

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; badgeKey?: 'reports' | 'drivers' | 'sos' };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: 'Operasional',
    items: [
      { name: 'Ringkasan', href: '/', icon: LayoutDashboard },
      { name: 'Laporan Pengguna', href: '/laporan', icon: Flag, badgeKey: 'reports' },
      { name: 'Laporan Investor', href: '/analitik', icon: TrendingUp },
      { name: 'Keuangan', href: '/keuangan', icon: Wallet },
      { name: 'Biaya Peta dan AI', href: '/biaya', icon: Gauge },
      { name: 'Catatan Aktivitas', href: '/aktivitas', icon: History },
    ],
  },
  {
    label: 'PimPim',
    items: [
      { name: 'Driver Pim', href: '/drivers', icon: Bike, badgeKey: 'drivers' },
      { name: 'Pesanan dan Trip', href: '/orders', icon: Route },
      { name: 'Peta Driver Langsung', href: '/peta-driver', icon: MapPin },
      { name: 'Pengaturan Tarif', href: '/pengaturan', icon: SlidersHorizontal },
    ],
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
    items: [
      { name: 'SOS Perjalanan', href: '/sos-perjalanan', icon: Siren, badgeKey: 'sos' },
      { name: 'Relawan Siaga SOS', href: '/sos', icon: ShieldAlert },
    ],
  },
  {
    label: 'Pemasaran',
    items: [{ name: 'Banner Promo', href: '/banners', icon: ImageIcon }],
  },
];

const allItems = navGroups.flatMap((g) => g.items);

function crumbFor(pathname: string): { group: string; name: string } {
  for (const g of navGroups) {
    for (const i of g.items) {
      if (i.href === pathname || (i.href !== '/' && pathname.startsWith(i.href + '/'))) return { group: g.label, name: i.name };
    }
  }
  return { group: 'Konsol Admin', name: 'Halaman' };
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
  const [openSos, setOpenSos] = useState(0);
  const [metaTick, setMetaTick] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

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

      const sos = await supabase.rpc('admin_sos_summary');
      if (isMounted && !sos.error && sos.data) {
        setOpenSos(Number((sos.data as { open?: number }).open ?? 0));
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
  }, [isAuthenticated, pathname, metaTick]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const t = setInterval(() => setMetaTick((k) => k + 1), 30000);
    return () => clearInterval(t);
  }, [isAuthenticated]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchText('');
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchResults = allItems.filter((i) => i.name.toLowerCase().includes(searchText.trim().toLowerCase())).slice(0, 8);
  const goTo = (href: string) => {
    setSearchOpen(false);
    setDrawerOpen(false);
    router.push(href);
  };

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
            {email} belum terdaftar sebagai admin PimPim. Hubungi pemilik sistem untuk diberi akses.
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
      <div className="flex flex-col h-full rounded-[28px] bg-gradient-to-b from-[#3a5272] to-[#22344f] text-white shadow-[10px_12px_26px_rgba(30,45,70,0.35),inset_0_1px_0_rgba(255,255,255,0.18)]">
        <div className="px-5 pt-5 pb-3 flex items-center gap-3 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#6cb3c6] to-[#2f7088] flex items-center justify-center text-white text-xl font-extrabold shadow-[4px_6px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.4)]">
            P
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold tracking-tight">PimPim</div>
            <div className="text-[11.5px] text-[#a9bdd6]">Konsol Admin</div>
          </div>
        </div>

        <div className="px-4 pb-2 shrink-0">
          <button
            onClick={() => { setSearchText(''); setSearchOpen(true); }}
            className="w-full flex items-center gap-2 rounded-xl bg-black/15 border border-white/10 px-3 py-2 text-[12.5px] text-[#a9bdd6] hover:bg-black/25 transition"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">Cari halaman</span>
            <span className="border border-white/20 rounded px-1.5 text-[11px]">/</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7f95b5]">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(item.href + '/');
                  const badge = item.badgeKey === 'reports' ? openReports : item.badgeKey === 'drivers' ? pendingDrivers : item.badgeKey === 'sos' ? openSos : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className={`group flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13px] font-semibold transition ${
                        isActive
                          ? 'bg-gradient-to-br from-[#eef4f9] to-[#c4d4e2] text-[#1e3a52] shadow-[4px_6px_12px_rgba(0,0,0,0.28),inset_0_1px_0_#fff]'
                          : 'text-[#c4d3e6] hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#2d6a86]' : 'text-[#8fa6c4] group-hover:text-white'}`} />
                      <span className="flex-1 truncate">{item.name}</span>
                      {badge > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-400 text-rose-950 text-[11px] font-extrabold flex items-center justify-center">
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

        <div className="p-3 shrink-0">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-black/15 border border-white/10">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6cb3c6] to-[#2f7088] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{email || 'Admin'}</div>
              <div className="text-[11px] text-[#a9bdd6]">Administrator</div>
            </div>
            <button
              onClick={handleLogout}
              title="Keluar"
              className="p-2 rounded-lg text-[#a9bdd6] hover:text-rose-300 hover:bg-rose-500/10 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );

    content = (
      <div
        className="min-h-screen flex"
        style={{ background: 'linear-gradient(160deg, #dde5ef 0%, #cbd7e5 55%, #c2cfdf 100%)', backgroundAttachment: 'fixed' }}
      >
        {/* Sidebar desktop */}
        <aside className="hidden lg:block print:!hidden w-[272px] shrink-0 p-3 sticky top-0 h-screen">
          {sidebar}
        </aside>

        {/* Sidebar mobile */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <aside className="relative w-72 max-w-[85%] h-full p-3">
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-6 right-6 z-10 p-1.5 rounded-lg text-slate-300 hover:bg-white/10"
                aria-label="Tutup menu"
              >
                <X className="w-4 h-4" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="print:hidden sticky top-0 z-30 h-14 bg-[#d3dde9]/80 backdrop-blur px-4 sm:px-6 lg:px-8 flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-white"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 text-[13px] text-slate-500 truncate">
              {crumbFor(pathname).group} <span className="text-slate-300 px-1">/</span>
              <span className="text-slate-900 font-semibold">{crumbFor(pathname).name}</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Production
              </span>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6cb3c6] to-[#2f7088] text-white text-xs font-bold flex items-center justify-center shadow-md">
                {initial}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-8 pt-2 sm:px-6 lg:px-8 [&_.bg-white]:!bg-[#f6f8fc]">{children}</main>

          {searchOpen && (
            <div className="print:hidden fixed inset-0 z-[60] flex items-start justify-center pt-24 px-4">
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
              <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 border-b border-slate-100">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    autoFocus
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && searchResults[0]) goTo(searchResults[0].href); }}
                    placeholder="Cari halaman, misalnya keuangan"
                    className="flex-1 py-3.5 text-sm outline-none"
                  />
                </div>
                <ul className="max-h-72 overflow-y-auto py-1">
                  {searchResults.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Halaman tidak ditemukan.</li>}
                  {searchResults.map((i) => {
                    const Icon = i.icon;
                    return (
                      <li key={i.href}>
                        <button onClick={() => goTo(i.href)} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-left">
                          <Icon className="w-4 h-4 text-slate-400" />{i.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <html lang="id">
      <body className={isLogin ? 'bg-slate-950 text-slate-100' : 'bg-[#cbd7e5] text-slate-900 antialiased'}>
        {content}
      </body>
    </html>
  );
}