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
  Flag,
  Clock,
  CalendarClock,
  Bike,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  ArrowUpRight,
} from 'lucide-react';

interface Stats {
  properties: number;
  users: number;
  preloved: number;
  sosActive: number;
  sosTotal: number;
}

interface PartnerLite {
  status: string;
  subscription_until: string | null;
}

interface ReportLite {
  id: string;
  created_at: string;
  context: string;
  reason: string;
  status: string;
  reporter_name: string;
  reported_name: string;
}

interface ReportSummary {
  open: number;
  reviewed: number;
  closed: number;
  new_7d: number;
}

const EMPTY_STATS: Stats = { properties: 0, users: 0, preloved: 0, sosActive: 0, sosTotal: 0 };

function fmtNum(n: number) {
  return new Intl.NumberFormat('id-ID').format(n);
}

function timeAgo(iso: string, nowMs: number) {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

const CONTEXT_LABEL: Record<string, string> = {
  tolongin_chat: 'Chat Tolongin',
  order_chat: 'Chat Pim Ride',
};

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [partners, setPartners] = useState<PartnerLite[]>([]);
  const [reports, setReports] = useState<ReportLite[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({ open: 0, reviewed: 0, closed: 0, new_7d: 0 });
  const [driverSummary, setDriverSummary] = useState({ pending: 0, approved: 0, online: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;

    async function run() {
      const count = async (q: PromiseLike<{ count: number | null }>) => {
        try {
          const r = await q;
          return r.count ?? 0;
        } catch {
          return 0;
        }
      };

      const [properties, users, preloved, sosActive, sosTotal, partnerRes, reportRes, summaryRes, driverRes] = await Promise.all([
        count(supabase.from('properties').select('*', { count: 'exact', head: true })),
        count(supabase.from('profiles').select('*', { count: 'exact', head: true })),
        count(supabase.from('preloved_items').select('*', { count: 'exact', head: true }).eq('status', 'active')),
        count(supabase.from('sos_volunteers').select('*', { count: 'exact', head: true }).eq('is_active', true)),
        count(supabase.from('sos_volunteers').select('*', { count: 'exact', head: true })),
        supabase.rpc('admin_tolongin_partners'),
        supabase.rpc('admin_reports_list', { p_status: 'open' }),
        supabase.rpc('admin_report_summary'),
        supabase.rpc('admin_driver_summary'),
      ]);

      if (!alive) return;
      setStats({ properties, users, preloved, sosActive, sosTotal });
      if (!partnerRes.error && partnerRes.data) setPartners(partnerRes.data as PartnerLite[]);
      if (!reportRes.error && reportRes.data) setReports((reportRes.data as ReportLite[]).slice(0, 5));
      if (!summaryRes.error && summaryRes.data) setSummary(summaryRes.data as ReportSummary);
      if (!driverRes.error && driverRes.data) setDriverSummary(driverRes.data as { pending: number; approved: number; online: number });
      setNowMs(Date.now());
      setUpdatedAt(new Date());
      setLoading(false);
      setRefreshing(false);
    }

    run();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const handleRefresh = () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  };

  const pendingPartners = partners.filter((p) => p.status === 'pending').length;
  const activePartners = partners.filter((p) => p.status === 'active' || p.status === 'approved').length;
  const activeWithSub = partners.filter((p) => p.status === 'active' || p.status === 'approved');
  const subExpired = activeWithSub.filter((p) => !p.subscription_until || new Date(p.subscription_until).getTime() <= nowMs).length;
  const subSoon = activeWithSub.filter((p) => {
    if (!p.subscription_until) return false;
    const left = new Date(p.subscription_until).getTime() - nowMs;
    return left > 0 && left <= 7 * 86400000;
  }).length;

  const actions = [
    {
      key: 'reports',
      label: 'Laporan pengguna terbuka',
      hint: 'Tinjau isi obrolan dan ambil tindakan',
      value: summary.open,
      href: '/laporan',
      icon: Flag,
      tone: 'rose',
    },
    {
      key: 'drivers',
      label: 'Driver menunggu verifikasi',
      hint: `${driverSummary.approved} driver aktif, ${driverSummary.online} online sekarang`,
      value: driverSummary.pending,
      href: '/drivers',
      icon: Bike,
      tone: 'amber',
    },
    {
      key: 'pending',
      label: 'Sobat menunggu verifikasi',
      hint: 'Periksa KTP, SIM, dan data kendaraan',
      value: pendingPartners,
      href: '/tolongin',
      icon: Clock,
      tone: 'amber',
    },
    {
      key: 'sub',
      label: 'Langganan Sobat bermasalah',
      hint: `${subExpired} sudah habis, ${subSoon} habis dalam 7 hari`,
      value: subExpired + subSoon,
      href: '/tolongin',
      icon: CalendarClock,
      tone: 'blue',
    },
  ];

  const toneClass: Record<string, { box: string; num: string }> = {
    rose: { box: 'bg-rose-50 text-rose-600 border-rose-100', num: 'text-rose-600' },
    amber: { box: 'bg-amber-50 text-amber-600 border-amber-100', num: 'text-amber-600' },
    blue: { box: 'bg-blue-50 text-blue-600 border-blue-100', num: 'text-blue-600' },
  };

  const totalTodo = actions.reduce((a, b) => a + b.value, 0);

  const kpis = [
    { label: 'Warga terdaftar', value: stats.users, sub: 'Akun anak kos dan pencari hunian', icon: Users, href: undefined as string | undefined },
    { label: 'Hunian terdaftar', value: stats.properties, sub: 'Kost, kontrakan, rumah sewa', icon: Building2, href: '/properties' },
    { label: 'Sobat siap kerja', value: activePartners, sub: 'Mitra aktif menerima pesanan', icon: HandHeart, href: '/tolongin' },
    { label: 'Preloved aktif', value: stats.preloved, sub: 'Listing siap jual', icon: ShoppingBag, href: '/preloved' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Ringkasan Operasional</h2>
          <p className="text-sm text-slate-500 mt-1">
            Kondisi ekosistem Kamar Kita dan hal yang perlu kamu tangani hari ini.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs text-slate-400">
              Diperbarui {updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Muat ulang
          </button>
        </div>
      </div>

      {/* Perlu tindakan */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Perlu tindakan</h3>
            <p className="text-xs text-slate-500 mt-0.5">Urutkan pekerjaanmu dari yang paling mendesak.</p>
          </div>
          {!loading && totalTodo === 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" /> Semua beres
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {actions.map((a) => {
            const Icon = a.icon;
            const t = toneClass[a.tone];
            return (
              <Link key={a.key} href={a.href} className="group p-5 flex items-start gap-4 hover:bg-slate-50/70 transition">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${t.box}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-2xl font-extrabold tracking-tight ${a.value > 0 ? t.num : 'text-slate-300'}`}>
                    {loading ? '-' : fmtNum(a.value)}
                  </div>
                  <div className="text-[13px] font-semibold text-slate-800 mt-0.5">{a.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{a.hint}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 mt-1 shrink-0" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          const body = (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-slate-300 hover:shadow transition h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">{k.label}</span>
                <Icon className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
                {loading ? '-' : fmtNum(k.value)}
              </div>
              <p className="text-xs text-slate-500 mt-1">{k.sub}</p>
            </div>
          );
          return k.href ? (
            <Link key={k.label} href={k.href} className="block">
              {body}
            </Link>
          ) : (
            <div key={k.label}>{body}</div>
          );
        })}
      </div>

      {/* Bawah */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Laporan terbaru */}
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Laporan terbuka terbaru</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {summary.new_7d} laporan masuk dalam 7 hari terakhir
              </p>
            </div>
            <Link href="/laporan" className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
              Lihat semua <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {reports.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">
              {loading ? 'Memuat...' : 'Tidak ada laporan terbuka.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link href="/laporan" className="px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/70 transition">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-slate-900 truncate">
                        {r.reported_name}
                        <span className="font-normal text-slate-400"> dilaporkan oleh </span>
                        {r.reporter_name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {CONTEXT_LABEL[r.context] ?? r.context} - {r.reason}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(r.created_at, nowMs)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* SOS + pintasan */}
        <div className="space-y-4">
          <section className="bg-slate-950 text-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <ShieldAlert className="w-4 h-4" /> Jaringan Relawan SOS
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tabular-nums">{loading ? '-' : stats.sosActive}</span>
              <span className="text-xs text-slate-400">dari {stats.sosTotal} relawan aktif</span>
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Relawan aktif muncul di radar darurat saat warga menekan tombol SOS.
            </p>
            <Link
              href="/sos"
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold transition"
            >
              Kelola relawan <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Pintasan</h3>
            <div className="mt-3 space-y-1.5">
              {[
                { href: '/banners', label: 'Atur banner promo' },
                { href: '/properties', label: 'Verifikasi hunian baru' },
                { href: '/tolongin', label: 'Daftar Sobat Tolongin' },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-[13px] font-medium text-slate-700 transition"
                >
                  {l.label}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}