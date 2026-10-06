'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from './lib/supabase';
import { 
  Building2, 
  HandHeart, 
  Users, 
  ShoppingBag, 
  ShieldAlert, 
  Clock, 
  ArrowUpRight, 
  Radio, 
  CheckCircle2,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface DashboardStats {
  totalProperties: number;
  pendingPartners: number;
  activePartners: number;
  totalUsers: number;
  activePreloved: number;
  activeSosVolunteers: number;
  totalSosVolunteers: number;
}

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProperties: 0,
    pendingPartners: 0,
    activePartners: 0,
    totalUsers: 0,
    activePreloved: 0,
    activeSosVolunteers: 0,
    totalSosVolunteers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      try {
        const [
          { count: propCount },
          { count: pendingPartnerCount },
          { count: activePartnerCount },
          { count: userCount },
          { count: prelovedCount },
          { count: activeSosCount },
          { count: totalSosCount },
        ] = await Promise.all([
          supabase.from('properties').select('*', { count: 'exact', head: true }),
          supabase.from('tolongin_partners').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('tolongin_partners').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('preloved_items').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('sos_volunteers').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('sos_volunteers').select('*', { count: 'exact', head: true }),
        ]);

        if (isMounted) {
          setStats({
            totalProperties: propCount || 0,
            pendingPartners: pendingPartnerCount || 0,
            activePartners: activePartnerCount || 0,
            totalUsers: userCount || 0,
            activePreloved: prelovedCount || 0,
            activeSosVolunteers: activeSosCount || 0,
            totalSosVolunteers: totalSosCount || 0,
          });
        }
      } catch (err) {
        console.warn('Gagal memuat ringkasan:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadStats();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Ringkasan Operasional</h1>
          <p className="text-sm text-gray-500 mt-1">
            Metrik operasional dan kesehatan ekosistem Kamar Kita secara real-time.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full w-fit">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Sistem Online & Sinkron
        </div>
      </div>

      {/* Grid 6 Metrik Utama (Lengkap & Seimbang) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 1. Hunian */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Hunian Terdaftar</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-gray-900 tracking-tight">
              {loading ? '-' : stats.totalProperties}
            </div>
            <p className="text-xs text-gray-500 mt-1">Kost, Kontrakan, & Rumah Sewa</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
            <Link href="/properties" className="text-orange-600 font-semibold hover:underline inline-flex items-center gap-1">
              Kelola Hunian <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* 2. Mitra Tolongin Butuh Approval */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Verifikasi Mitra</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-gray-900 tracking-tight">
              {loading ? '-' : stats.pendingPartners}
            </div>
            <p className="text-xs text-gray-500 mt-1">Mitra Tolongin menunggu approval</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
            <Link href="/tolongin" className="text-amber-600 font-semibold hover:underline inline-flex items-center gap-1">
              Buka Pengajuan <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* 3. Sobat Tolongin Aktif */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Sobat Siap Kerja</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <HandHeart className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-gray-900 tracking-tight">
              {loading ? '-' : stats.activePartners}
            </div>
            <p className="text-xs text-gray-500 mt-1">Mitra aktif menerima pesanan warga</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
            <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Terverifikasi
            </span>
          </div>
        </div>

        {/* 4. Relawan Siaga SOS (Baru) */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Relawan Siaga SOS</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-gray-900 tracking-tight">
                {loading ? '-' : stats.activeSosVolunteers}
              </span>
              <span className="text-xs text-gray-500">/ {stats.totalSosVolunteers} terdaftar</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Aparat, medis, & warga aktif di radar</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
            <Link href="/sos" className="text-rose-600 font-semibold hover:underline inline-flex items-center gap-1">
              Kelola Posko & Tim <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* 5. User Terdaftar */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Warga Terdaftar</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-gray-900 tracking-tight">
              {loading ? '-' : stats.totalUsers}
            </div>
            <p className="text-xs text-gray-500 mt-1">Akun anak kos & pencari hunian</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
            <span>Komunitas Jatinangor</span>
          </div>
        </div>

        {/* 6. Preloved */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Barang Preloved</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-gray-900 tracking-tight">
              {loading ? '-' : stats.activePreloved}
            </div>
            <p className="text-xs text-gray-500 mt-1">Listing barang bekas siap jual</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
            <Link href="/preloved" className="text-purple-600 font-semibold hover:underline inline-flex items-center gap-1">
              Cek Listing <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bagian Bawah: Banner Siaga & Pintasan Cepat */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Banner Pemantauan SOS Live */}
        <div className="lg:col-span-2 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/10 text-rose-300 text-xs font-semibold mb-3 border border-white/10">
                <Radio className="w-3.5 h-3.5 animate-pulse text-rose-400" />
                Pusat Tanggap Darurat Warga (SOS)
              </div>
              <h2 className="text-lg font-bold">Keamanan & Solidaritas Lingkungan Kos</h2>
              <p className="text-xs text-slate-300 mt-1.5 max-w-md leading-relaxed">
                Relawan yang aktif akan langsung terdeteksi oleh radar darurat di HP anak kos saat tombol SOS ditekan. Pastikan titik posko siaga selalu terbarui.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
            <div className="text-xs text-slate-300">
              Status radar: <span className="font-semibold text-white">{stats.activeSosVolunteers} Posko Standby</span>
            </div>
            <Link
              href="/sos"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-semibold transition"
            >
              Buka Radar Admin <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Akses Pintas Operasional */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Aksi Cepat Admin</h3>
            <p className="text-xs text-gray-500 mt-1">Kelola konten dan aset promosi</p>

            <div className="space-y-2.5 mt-4">
              <Link
                href="/banners"
                className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 text-xs font-medium text-gray-700 transition"
              >
                <span>Atur Banner Promo</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
              <Link
                href="/properties"
                className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 text-xs font-medium text-gray-700 transition"
              >
                <span>Verifikasi Kost Baru</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
              <Link
                href="/tolongin"
                className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 text-xs font-medium text-gray-700 transition"
              >
                <span>Daftar Sobat Tolongin</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}