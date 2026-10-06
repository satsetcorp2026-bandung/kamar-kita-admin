import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { 
  Building2, 
  HandHeart, 
  ShoppingBag, 
  Sparkles, 
  Truck, 
  Image as ImageIcon, 
  LayoutDashboard,
  ShieldAlert
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Kamar Kita - Admin Console',
  description: 'Panel Manajemen Ekosistem Kamar Kita',
};

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
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <Icon className="w-4 h-4 text-orange-400" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}