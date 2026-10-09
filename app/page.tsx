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
  Activity,
  Wallet,
  MapPin,
} from 'lucide-react';

interface Stats { properties: number; users: number; preloved: number; sosActive: number; sosTotal: number }
interface PartnerLite { status: string; subscription_until: string | null }
interface ReportLite { id: string; created_at: string; context: string; reason: string; status: string; reporter_name: string; reported_name: string }
interface ReportSummary { open: number; reviewed: number; closed: number; new_7d: number }
interface Overview {
  today_orders: number; yesterday_orders: number; today_completed: number; today_income: number;
  online: number; engaged: number;
  days: { day: string; total: number; completed: number }[];
  by_service: Record<string, number>;
}
interface DriverLite {
  id: string; full_name: string | null; verification_status: string | null; docs_total: number; docs_pending: number;
  created_at: string | null; updated_at: string | null;
}
interface ReviewItem { key: string; kind: 'report' | 'driver'; title: string; sub: string; at: string; href: string }
interface TripLite {
  id: string; status: string; service_type: string | null; car_class: string | null;
  pickup_address: string | null; destination_address: string | null; distance_km: number | null; created_at: string;
}

const EMPTY_STATS: Stats = { properties: 0, users: 0, preloved: 0, sosActive: 0, sosTotal: 0 };

const glass =
  'rounded-[22px] border border-white/70 bg-gradient-to-br from-white/60 to-white/30 shadow-[8px_10px_22px_rgba(48,66,92,0.16),-6px_-6px_16px_rgba(255,255,255,0.6)]';
const tile =
  'rounded-[20px] p-4 shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]';
const iconBox =
  'w-10 h-10 rounded-[13px] bg-gradient-to-br from-white/80 to-white/30 flex items-center justify-center text-[#2d6a86] shadow-[3px_4px_8px_rgba(48,66,92,0.22),-2px_-2px_6px_rgba(255,255,255,0.6)]';
const softBtn =
  'inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#4a98ad] to-[#2f7088] px-5 py-2.5 text-[13px] font-bold text-white shadow-[4px_6px_12px_rgba(36,76,96,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-105 transition';

function fmtNum(n: number) { return new Intl.NumberFormat('id-ID').format(n); }
function rp(n: number) { return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n)); }
function timeAgo(iso: string, nowMs: number) {
  const m = Math.floor(Math.max(0, nowMs - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}
function shortDay(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' });
}
function greeting(h: number) {
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

const CONTEXT_LABEL: Record<string, string> = { tolongin_chat: 'Chat Tolongin', order_chat: 'Chat Pim Ride' };
const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-800' },
  searching: { label: 'Mencari', cls: 'bg-sky-100 text-sky-800' },
  driver_assigned: { label: 'Berjalan', cls: 'bg-sky-100 text-sky-800' },
  driver_arrived: { label: 'Berjalan', cls: 'bg-sky-100 text-sky-800' },
  in_trip: { label: 'Berjalan', cls: 'bg-sky-100 text-sky-800' },
  cancelled_by_passenger: { label: 'Batal', cls: 'bg-rose-100 text-rose-800' },
  cancelled_by_driver: { label: 'Batal', cls: 'bg-rose-100 text-rose-800' },
  expired: { label: 'Kedaluwarsa', cls: 'bg-slate-200 text-slate-700' },
};

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [partners, setPartners] = useState<PartnerLite[]>([]);
  const [reports, setReports] = useState<ReportLite[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({ open: 0, reviewed: 0, closed: 0, new_7d: 0 });
  const [driverSummary, setDriverSummary] = useState({ pending: 0, approved: 0, online: 0 });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trips, setTrips] = useState<TripLite[]>([]);
  const [pendingDrivers, setPendingDrivers] = useState<DriverLite[]>([]);
  const [sosTrip, setSosTrip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hour] = useState(() => new Date().getHours());
  const [reloadKey, setReloadKey] = useState(0);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function run() {
      const count = async (q: PromiseLike<{ count: number | null }>) => {
        try { const r = await q; return r.count ?? 0; } catch { return 0; }
      };
      const [properties, users, preloved, sosActive, sosTotal, partnerRes, reportRes, summaryRes, driverRes, ovRes, tripRes, sosRes, roleRes, drvListRes] = await Promise.all([
        count(supabase.from('properties').select('*', { count: 'exact', head: true })),
        count(supabase.from('profiles').select('*', { count: 'exact', head: true })),
        count(supabase.from('preloved_items').select('*', { count: 'exact', head: true }).eq('status', 'active')),
        count(supabase.from('sos_volunteers').select('*', { count: 'exact', head: true }).eq('is_active', true)),
        count(supabase.from('sos_volunteers').select('*', { count: 'exact', head: true })),
        supabase.rpc('admin_tolongin_partners'),
        supabase.rpc('admin_reports_list', { p_status: 'open' }),
        supabase.rpc('admin_report_summary'),
        supabase.rpc('admin_driver_summary'),
        supabase.rpc('admin_overview_pim'),
        supabase.rpc('admin_orders_list', { p_group: null, p_search: null, p_days: 7, p_limit: 5 }),
        supabase.rpc('admin_sos_summary'),
        supabase.rpc('my_admin_role'),
        supabase.rpc('admin_drivers_list'),
      ]);
      if (!alive) return;
      setStats({ properties, users, preloved, sosActive, sosTotal });
      // Bila SQL Part AZ belum dijalankan, anggap Pemilik
      setRole(roleRes.error ? 'owner' : ((roleRes.data as string | null) ?? 'admin'));
      if (!partnerRes.error && partnerRes.data) setPartners(partnerRes.data as PartnerLite[]);
      if (!reportRes.error && reportRes.data) setReports(reportRes.data as ReportLite[]);
      if (!drvListRes.error && Array.isArray(drvListRes.data)) {
        setPendingDrivers(
          (drvListRes.data as DriverLite[]).filter((d) => (d.verification_status ?? 'pending') === 'pending' && Number(d.docs_total) > 0)
        );
      }
      if (!summaryRes.error && summaryRes.data) setSummary(summaryRes.data as ReportSummary);
      if (!driverRes.error && driverRes.data) setDriverSummary(driverRes.data as { pending: number; approved: number; online: number });
      if (!ovRes.error && ovRes.data) setOverview(ovRes.data as Overview);
      if (!tripRes.error && tripRes.data) setTrips((tripRes.data as TripLite[]).slice(0, 5));
      if (!sosRes.error && sosRes.data) setSosTrip(Number((sosRes.data as { open?: number }).open ?? 0));
      setNowMs(Date.now());
      setUpdatedAt(new Date());
      setLoading(false);
      setRefreshing(false);
    }
    run();
    return () => { alive = false; };
  }, [reloadKey]);

  const handleRefresh = () => { setRefreshing(true); setReloadKey((k) => k + 1); };

  const pendingPartners = partners.filter((p) => p.status === 'pending').length;
  const activeWithSub = partners.filter((p) => p.status === 'active' || p.status === 'approved');
  const activePartners = activeWithSub.length;
  const subExpired = activeWithSub.filter((p) => !p.subscription_until || new Date(p.subscription_until).getTime() <= nowMs).length;
  const subSoon = activeWithSub.filter((p) => {
    if (!p.subscription_until) return false;
    const left = new Date(p.subscription_until).getTime() - nowMs;
    return left > 0 && left <= 7 * 86400000;
  }).length;

  const actions = [
    { key: 'reports', label: 'Laporan pengguna terbuka', value: summary.open, href: '/laporan', tone: 'bg-rose-100 text-rose-800', icon: Flag },
    { key: 'sos', label: 'SOS perjalanan terbuka', value: sosTrip, href: '/sos-perjalanan', tone: 'bg-rose-100 text-rose-800', icon: ShieldAlert },
    { key: 'drivers', label: 'Driver menunggu verifikasi', value: driverSummary.pending, href: '/drivers', tone: 'bg-sky-100 text-sky-800', icon: Bike },
    { key: 'pending', label: 'Sobat menunggu verifikasi', value: pendingPartners, href: '/tolongin', tone: 'bg-sky-100 text-sky-800', icon: Clock },
    { key: 'sub', label: 'Langganan Sobat habis atau hampir habis', value: subExpired + subSoon, href: '/tolongin', tone: 'bg-amber-100 text-amber-800', icon: CalendarClock },
  ];
  const totalTodo = actions.reduce((a, b) => a + b.value, 0);

  const reviewItems: ReviewItem[] = [
    ...reports.map((r) => ({
      key: `r-${r.id}`, kind: 'report' as const,
      title: `${r.reported_name} dilaporkan oleh ${r.reporter_name}`,
      sub: `${CONTEXT_LABEL[r.context] ?? r.context}, ${r.reason}`,
      at: r.created_at, href: '/laporan',
    })),
    ...pendingDrivers.map((d) => ({
      key: `d-${d.id}`, kind: 'driver' as const,
      title: `${d.full_name ?? 'Driver baru'} menunggu verifikasi`,
      sub: `${d.docs_pending} dari ${d.docs_total} dokumen belum diperiksa`,
      at: d.updated_at ?? d.created_at ?? new Date(0).toISOString(), href: '/drivers',
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const reviewTotal = reviewItems.length;
  const reviewShown = reviewItems.slice(0, 6);

  const ov = overview;
  const diff = ov ? ov.today_orders - ov.yesterday_orders : 0;
  const diffText = !ov ? '' : ov.yesterday_orders === 0 ? 'Kemarin belum ada order' : `${diff >= 0 ? '+' : ''}${Math.round((diff / ov.yesterday_orders) * 100)}% dari kemarin`;

  // grafik batang
  const days = ov?.days ?? [];
  const maxDay = Math.max(4, ...days.map((d) => d.total));
  const barW = 28;
  const gap = 17;

  // donat
  const ride = ov?.by_service?.ride ?? 0;
  const car = ov?.by_service?.car ?? 0;
  const svcTotal = ride + car;
  const C = 2 * Math.PI * 56;
  const rideLen = svcTotal ? (ride / svcTotal) * C : 0;
  const carLen = svcTotal ? (car / svcTotal) * C : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Ringkasan</h2>
        <div className="flex items-center gap-3">
          {updatedAt && <span className="text-xs text-slate-500">Diperbarui {updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={handleRefresh} disabled={refreshing} className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-white/80 bg-white/70 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white disabled:opacity-60 transition">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
        </div>
      </div>

      {/* Sambutan */}
      <section className="rounded-[26px] bg-gradient-to-br from-[#566b82] to-[#3b4f66] text-white px-6 sm:px-8 py-6 flex items-center justify-between gap-6 flex-wrap shadow-[10px_12px_24px_rgba(40,56,80,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]">
        <div className="max-w-md">
          <div className="text-xl sm:text-2xl font-extrabold">{greeting(hour)}, Admin</div>
          <p className="text-sm text-[#d3deea] mt-2 mb-4">
            {loading ? 'Memuat kondisi hari ini...' : `Hari ini ${ov?.today_orders ?? 0} order masuk dan ${ov?.online ?? 0} driver online. ${totalTodo > 0 ? `Ada ${totalTodo} hal yang perlu dicek.` : 'Semua beres.'}`}
          </p>
          <a href="#tindakan" className={softBtn}>Lihat yang perlu tindakan</a>
        </div>
        <svg viewBox="0 0 220 120" className="w-48 sm:w-56 h-auto" role="img" aria-label="Ilustrasi motor">
          <ellipse cx="110" cy="108" rx="86" ry="8" fill="rgba(0,0,0,.22)" />
          <circle cx="48" cy="86" r="22" fill="#2b3d54" stroke="#9fc9d8" strokeWidth="5" /><circle cx="48" cy="86" r="6" fill="#9fc9d8" />
          <circle cx="174" cy="86" r="22" fill="#2b3d54" stroke="#9fc9d8" strokeWidth="5" /><circle cx="174" cy="86" r="6" fill="#9fc9d8" />
          <path d="M48 86 L84 50 L128 50 L174 86" fill="none" stroke="#6cb3c6" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M84 50 L96 34 L128 34 L138 50" fill="#4a98ad" stroke="#4a98ad" strokeWidth="6" strokeLinejoin="round" />
          <rect x="100" y="26" width="30" height="10" rx="5" fill="#e8f0f6" />
          <path d="M150 60 L160 40 L172 38" fill="none" stroke="#e8f0f6" strokeWidth="6" strokeLinecap="round" />
        </svg>
      </section>

      {/* Kartu angka */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className={`${tile} bg-gradient-to-br from-[#8fd0c8] to-[#62aea8]`}>
          <div className={iconBox}><Activity className="w-5 h-5" /></div>
          <div className="mt-3 text-[13px] font-bold text-[#17413f]">Order hari ini</div>
          <div className="text-3xl font-extrabold text-[#0f2f2e] tabular-nums">{loading ? '-' : fmtNum(ov?.today_orders ?? 0)}</div>
          <div className="text-xs text-[#17413f]">{diffText}</div>
        </div>
        <div className={`${tile} bg-gradient-to-br from-[#d0dae6] to-[#b3c3d4]`}>
          <div className={iconBox}><CheckCircle2 className="w-5 h-5" /></div>
          <div className="mt-3 text-[13px] font-bold text-[#2c3e55]">Trip selesai hari ini</div>
          <div className="text-3xl font-extrabold text-slate-800 tabular-nums">{loading ? '-' : fmtNum(ov?.today_completed ?? 0)}</div>
          <div className="text-xs text-[#2c3e55]">{ov && ov.today_orders > 0 ? `${Math.round((ov.today_completed / ov.today_orders) * 100)}% dari order masuk` : 'Belum ada order'}</div>
        </div>
        {role === 'owner' || role === null ? (
        <Link href="/keuangan" className={`${tile} block bg-gradient-to-br from-[#eaf3f9] to-[#cfe2ee]`}>
          <div className={iconBox}><Wallet className="w-5 h-5" /></div>
          <div className="mt-3 text-[13px] font-bold text-[#2c3e55]">Pendapatan platform hari ini</div>
          <div className="text-2xl font-extrabold text-slate-800 tabular-nums mt-1">{loading ? '-' : rp(ov?.today_income ?? 0)}</div>
          <div className="text-xs text-[#2c3e55]">Komisi dan biaya platform</div>
        </Link>
        ) : (
        <Link href="/laporan" className={`${tile} block bg-gradient-to-br from-[#eaf3f9] to-[#cfe2ee]`}>
          <div className={iconBox}><Wallet className="w-5 h-5" /></div>
          <div className="mt-3 text-[13px] font-bold text-[#2c3e55]">Laporan pengguna terbuka</div>
          <div className="text-3xl font-extrabold text-slate-800 tabular-nums mt-1">{loading ? '-' : fmtNum(summary.open)}</div>
          <div className="text-xs text-[#2c3e55]">Perlu ditinjau</div>
        </Link>
        )}
        <Link href="/peta-driver" className={`${tile} block bg-gradient-to-br from-[#a9a4d4] to-[#8782bb]`}>
          <div className={iconBox}><MapPin className="w-5 h-5" /></div>
          <div className="mt-3 text-[13px] font-bold text-[#2a2757]">Driver online</div>
          <div className="text-3xl font-extrabold text-[#1c1a40] tabular-nums">{loading ? '-' : fmtNum(ov?.online ?? 0)}</div>
          <div className="text-xs text-[#2a2757]">{ov?.engaged ?? 0} sedang order</div>
        </Link>
      </div>

      {/* Grafik */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className={`${glass} p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold text-slate-800">Order 7 hari terakhir</h3>
            <div className="flex items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#a9cfdc]" />Masuk</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-[#3d8199]" />Selesai</span>
            </div>
          </div>
          {days.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{loading ? 'Memuat...' : 'Belum ada data order.'}</p>
          ) : (
            <svg viewBox="0 0 380 170" className="w-full h-auto" role="img" aria-label="Grafik order 7 hari terakhir">
              <g stroke="rgba(30,43,63,.1)">
                <line x1="30" x2="370" y1="20" y2="20" /><line x1="30" x2="370" y1="65" y2="65" /><line x1="30" x2="370" y1="110" y2="110" />
              </g>
              <g fill="#5b6f86" fontSize="10" textAnchor="end">
                <text x="24" y="23">{maxDay}</text><text x="24" y="68">{Math.round(maxDay * 0.66)}</text><text x="24" y="113">{Math.round(maxDay * 0.33)}</text><text x="24" y="148">0</text>
              </g>
              {days.map((d, i) => {
                const x = 42 + i * (barW + gap);
                const h = (d.total / maxDay) * 122;
                const hc = (d.completed / maxDay) * 122;
                return (
                  <g key={d.day}>
                    <rect x={x} y={142 - h} width={barW} height={Math.max(h, 2)} rx="9" fill="#a9cfdc" />
                    <rect x={x} y={142 - hc} width={barW} height={Math.max(hc, 0)} rx="9" fill="#3d8199" />
                    <text x={x + barW / 2} y="160" textAnchor="middle" fontSize="10.5" fill="#5b6f86">{shortDay(d.day)}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </section>

        <section className={`${glass} p-5`}>
          <h3 className="text-sm font-extrabold text-slate-800 mb-3">Order per layanan (30 hari)</h3>
          {svcTotal === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{loading ? 'Memuat...' : 'Belum ada order.'}</p>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <svg viewBox="0 0 160 160" className="w-36 h-36 shrink-0" role="img" aria-label="Donat order per layanan">
                <circle cx="80" cy="80" r="70" fill="rgba(255,255,255,.35)" />
                <g transform="rotate(-90 80 80)" fill="none" strokeWidth="24">
                  <circle cx="80" cy="80" r="56" stroke="#3d8199" strokeDasharray={`${rideLen} ${C}`} strokeDashoffset="0" />
                  <circle cx="80" cy="80" r="56" stroke="#8782bb" strokeDasharray={`${carLen} ${C}`} strokeDashoffset={-rideLen} />
                </g>
                <text x="80" y="78" textAnchor="middle" fontSize="22" fontWeight="800" fill="#1e2b3f">{svcTotal}</text>
                <text x="80" y="95" textAnchor="middle" fontSize="10" fill="#5b6f86">order</text>
              </svg>
              <div className="space-y-2.5 text-[13px] flex-1 min-w-[120px]">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#3d8199]" /><span className="flex-1">Pim Ride</span><b>{Math.round((ride / svcTotal) * 100)}%</b></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#8782bb]" /><span className="flex-1">Pim Car</span><b>{Math.round((car / svcTotal) * 100)}%</b></div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Tindakan + trip */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section id="tindakan" className={`${glass} p-5`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold text-slate-800">Perlu tindakan</h3>
            {!loading && totalTodo === 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full"><CheckCircle2 className="w-3.5 h-3.5" /> Semua beres</span>
            )}
          </div>
          <ul>
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <li key={a.key} className="border-b border-slate-900/5 last:border-0">
                  <Link href={a.href} className="flex items-center gap-3 py-2.5 hover:opacity-80 transition">
                    <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="flex-1 text-[13px] text-slate-800">{a.label}</span>
                    <span className={`text-[11px] font-extrabold rounded-full px-2.5 py-0.5 ${a.value > 0 ? a.tone : 'bg-slate-200/70 text-slate-500'}`}>{loading ? '-' : a.value}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={`${glass} p-5`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold text-slate-800">Trip terbaru</h3>
            <Link href="/orders" className="text-xs font-bold text-[#2d6a86] inline-flex items-center gap-1">Lihat semua <ArrowUpRight className="w-3.5 h-3.5" /></Link>
          </div>
          {trips.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{loading ? 'Memuat...' : 'Belum ada trip dalam 7 hari terakhir.'}</p>
          ) : (
            <ul>
              {trips.map((t) => {
                const st = STATUS_CHIP[t.status] ?? { label: t.status, cls: 'bg-slate-200 text-slate-700' };
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5 border-b border-slate-900/5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-slate-800 truncate">{t.pickup_address ?? '-'} ke {t.destination_address ?? '-'}</div>
                      <div className="text-xs text-slate-500">{t.service_type === 'car' ? 'Pim Car' : 'Pim Ride'}{t.distance_km ? `, ${Number(t.distance_km).toFixed(1).replace('.', ',')} km` : ''}, {timeAgo(t.created_at, nowMs)}</div>
                    </div>
                    <span className={`text-[10.5px] font-extrabold rounded-full px-2.5 py-0.5 ${st.cls}`}>{st.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Ekosistem + laporan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className={`${glass} p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-extrabold text-slate-800">Perlu ditinjau</h3>
            <div className="flex items-center gap-3">
              <Link href="/laporan" className="text-xs font-bold text-[#2d6a86] inline-flex items-center gap-1">Laporan <ArrowUpRight className="w-3.5 h-3.5" /></Link>
              <Link href="/drivers" className="text-xs font-bold text-[#2d6a86] inline-flex items-center gap-1">Driver <ArrowUpRight className="w-3.5 h-3.5" /></Link>
            </div>
          </div>
          {reviewShown.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{loading ? 'Memuat...' : 'Tidak ada yang menunggu. Bersih.'}</p>
          ) : (
            <ul>
              {reviewShown.map((r) => (
                <li key={r.key} className="border-b border-slate-900/5 last:border-0">
                  <Link href={r.href} className="flex items-center gap-3 py-2.5 hover:opacity-80 transition">
                    <span className={`text-[10.5px] font-extrabold rounded-full px-2.5 py-0.5 shrink-0 ${r.kind === 'report' ? 'bg-rose-100 text-rose-800' : 'bg-sky-100 text-sky-800'}`}>
                      {r.kind === 'report' ? 'Laporan' : 'Driver'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-slate-800 truncate">{r.title}</div>
                      <div className="text-xs text-slate-500 truncate">{r.sub}</div>
                    </div>
                    <span className="text-[11px] text-slate-500 shrink-0">{timeAgo(r.at, nowMs)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {reviewTotal > reviewShown.length && (
            <p className="pt-2 text-xs text-slate-500">dan {reviewTotal - reviewShown.length} lagi di halaman masing-masing</p>
          )}
        </section>

        <section className={`${glass} p-5`}>
          <h3 className="text-sm font-extrabold text-slate-800 mb-2">Ekosistem</h3>
          {[
            { label: 'Warga terdaftar', value: stats.users, icon: Users, href: '' },
            { label: 'Hunian terdaftar', value: stats.properties, icon: Building2, href: '/properties' },
            { label: 'Sobat siap kerja', value: activePartners, icon: HandHeart, href: '/tolongin' },
            { label: 'Preloved aktif', value: stats.preloved, icon: ShoppingBag, href: '/preloved' },
            { label: 'Relawan SOS aktif', value: stats.sosActive, icon: ShieldAlert, href: '/sos' },
          ].map((k) => {
            const Icon = k.icon;
            const row = (
              <div className="flex items-center gap-3 py-2.5 border-b border-slate-900/5 last:border-0">
                <Icon className="w-4 h-4 text-slate-500" />
                <span className="flex-1 text-[13px] text-slate-800">{k.label}</span>
                <b className="text-sm tabular-nums">{loading ? '-' : fmtNum(k.value)}</b>
              </div>
            );
            return k.href ? <Link key={k.label} href={k.href} className="block hover:opacity-80 transition">{row}</Link> : <div key={k.label}>{row}</div>;
          })}
        </section>
      </div>
    </div>
  );
}