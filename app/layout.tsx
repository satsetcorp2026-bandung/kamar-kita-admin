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
  LogOut,
  Loader2
} from 'lucide-react';

const navigation = [
  { name: 'Ringkasan', href: '/', icon: LayoutDashboard },
  { name: 'Hunian (Kost & Sewa)', href: '/properties', icon: Building2 },
  { name: 'Sobat Tolongin', href: '/tolongin', icon: HandHeart },
  { name: 'Relawan Siaga SOS', href: '/sos', icon: ShieldAlert },
  { name: 'Jual Beli Kost', href: '/kos-sales', icon: Building2 },
  { name: 'Preloved', href: '/preloved', icon: ShoppingBag },
  { name: 'Cleaning Service', href: '/cleaning', icon: Sparkles },
  { name: 'Jasa Angkut', href: '/angkut', icon: Truck },
  { name: 'Banner Promo', href: '/banners', icon: ImageIcon },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkUser() {
      // Jika berada di halaman login, tidak perlu redirect loop
      if (pathname === '/login') {
        if (isMounted) {
          setCheckingAuth(false);
          setIsAuthenticated(false);
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        if (isMounted) {
          setIsAuthenticated(false);
          setCheckingAuth(false);
          router.replace('/login');
        }
      } else {
        if (isMounted) {
          setIsAuthenticated(true);
          setCheckingAuth(false);
        }
      }
    }

    checkUser();

    // Pantau perubahan status auth (logout/login)
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login') {
        setIsAuthenticated(false);
        router.replace('/login');
      } else if (session) {
        setIsAuthenticated(true);
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [pathname, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // Jika sedang di halaman login, render halaman login tanpa sidebar
  if (pathname === '/login') {
    return (
      <html lang="id">
        <body className="bg-slate-950 text-slate-100">{children}</body>
      </html>
    );
  }

  // Tampilan loading saat cek sesi login
  if (checkingAuth) {
    return (
      <html lang="id">
        <body className="bg-slate-950 text-white min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            <p className="text-xs text-slate-400 font-medium">Memeriksa izin akses admin...</p>
          </div>
        </body>
      </html>
    );
  }

  // Jika tidak punya akses, tahan jangan render konten
  if (!isAuthenticated) {
    return null;
  }

  return (
    <html lang="id">
      <body className="bg-slate-50 text-slate-900 flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 shrink-0">
          <div className="p-6 border-b border-slate-800">
            <h1 className="text-xl font-bold tracking-tight text-orange-500">Kamar Kita</h1>
            <p className="text-xs text-slate-400 mt-1">Admin Operations</p>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-orange-400' : 'text-slate-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Footer Sidebar: Tombol Keluar */}
          <div className="p-4 border-t border-slate-800">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition"
            >
              <LogOut className="w-4 h-4" />
              Keluar Sesi
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}