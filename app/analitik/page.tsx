'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Users,
  UserPlus,
  Activity,
  Printer,
  Download,
  AlertTriangle,
  Loader2,
  Search,
  X,
  Info,
  FlaskConical,
} from 'lucide-react';

interface Overview {
  tracking_since: string | null;
  total_users: number;
  new_users: number;
  dau: number;
  wau: number;
  mau: number;
  test_accounts: number;
  orders_total: number;
  orders_completed: number;
  orders_cancelled: number;
  orders_expired: number;
  gmv: number;
  avg_price: number;
  avg_km: number;
  commission: number;
  platform_fee: number;
  repeat_riders: number;
  riders: number;
  drivers_approved: number;
  sobat_active: number;
}

interface SeriesRow {
  day: string;
  new_users: number;
  active_users: number;
  orders: number;
  completed: number;
  gmv: number;
}

interface RetentionCell {
  eligible: number;
  retained: number;
}

interface Retention {
  tracking_since: string | null;
  d1?: RetentionCell;
  d7?: RetentionCell;
  d30?: RetentionCell;
}

interface AreaRow {
  lat: number;
  lng: number;
  users: number;
  opens: number;
}

interface HourRow {
  dow: number;
  hour: number;
  orders: number;
}

interface TestUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  is_test: boolean;
  is_admin: boolean;
  is_driver: boolean;
  is_sobat: boolean;
}

// ---------- util ----------
const nf = new Intl.NumberFormat('id-ID');
const rp = (n: number) => 'Rp ' + nf.format(Math.round(n || 0));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '-');

const CITIES: { name: string; lat: number; lng: number }[] = [
  { name: 'Jatinangor, Sumedang', lat: -6.93, lng: 107.77 },
  { name: 'Sumedang Kota', lat: -6.86, lng: 107.92 },
  { name: 'Bandung', lat: -6.917, lng: 107.619 },
  { name: 'Cimahi', lat: -6.872, lng: 107.542 },
  { name: 'Lembang / Bandung Barat', lat: -6.81, lng: 107.62 },
  { name: 'Soreang / Kab. Bandung', lat: -7.03, lng: 107.52 },
  { name: 'Garut', lat: -7.215, lng: 107.9 },
  { name: 'Tasikmalaya', lat: -7.33, lng: 108.22 },
  { name: 'Cianjur', lat: -6.82, lng: 107.14 },
  { name: 'Subang', lat: -6.57, lng: 107.76 },
  { name: 'Majalengka', lat: -6.84, lng: 108.23 },
  { name: 'Cirebon', lat: -6.71, lng: 108.557 },
  { name: 'Purwakarta', lat: -6.556, lng: 107.443 },
  { name: 'Karawang', lat: -6.32, lng: 107.337 },
  { name: 'Bekasi', lat: -6.238, lng: 106.992 },
  { name: 'Jakarta', lat: -6.2, lng: 106.816 },
  { name: 'Depok', lat: -6.402, lng: 106.794 },
  { name: 'Bogor', lat: -6.595, lng: 106.816 },
  { name: 'Tangerang', lat: -6.178, lng: 106.63 },
  { name: 'Sukabumi', lat: -6.92, lng: 106.927 },
  { name: 'Semarang', lat: -6.966, lng: 110.42 },
  { name: 'Yogyakarta', lat: -7.797, lng: 110.37 },
  { name: 'Solo', lat: -7.566, lng: 110.82 },
  { name: 'Surabaya', lat: -7.25, lng: 112.75 },
  { name: 'Malang', lat: -7.98, lng: 112.63 },
  { name: 'Denpasar', lat: -8.65, lng: 115.22 },
  { name: 'Medan', lat: 3.595, lng: 98.672 },
  { name: 'Palembang', lat: -2.976, lng: 104.775 },
  { name: 'Makassar', lat: -5.147, lng: 119.432 },
];

function distKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function areaName(lat: number, lng: number) {
  let best = { name: '', d: Infinity };
  for (const c of CITIES) {
    const d = distKm(lat, lng, c.lat, c.lng);
    if (d < best.d) best = { name: c.name, d };
  }
  return best.d <= 30 ? best.name : `Lainnya (${lat.toFixed(1)}, ${lng.toFixed(1)})`;
}

function csvDownload(filename: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- peta (Leaflet dimuat dari CDN, tanpa kuota Google Maps) ----------
interface LMap {
  setView(c: [number, number], z: number): LMap;
  fitBounds(b: [number, number][], o?: object): void;
  remove(): void;
}
interface LLayer {
  addTo(m: LMap): { bindTooltip(t: string): void };
}
interface LeafletGlobal {
  map(el: HTMLElement, o?: object): LMap;
  tileLayer(url: string, o?: object): { addTo(m: LMap): void };
  circleMarker(ll: [number, number], o?: object): LLayer;
}

function loadLeaflet(): Promise<LeafletGlobal> {
  const w = window as unknown as { L?: LeafletGlobal };
  if (w.L) return Promise.resolve(w.L);
  return new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => (w.L ? resolve(w.L) : reject(new Error('Leaflet tidak termuat')));
    script.onerror = () => reject(new Error('Leaflet gagal diunduh'));
    document.body.appendChild(script);
  });
}

function AreaMap({ areas }: { areas: AreaRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lib, setLib] = useState<LeafletGlobal | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadLeaflet()
      .then((L) => alive && setLib(L))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!lib || !ref.current) return;
    const map = lib.map(ref.current, { scrollWheelZoom: false }).setView([-6.93, 107.77], 8);
    lib.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    const max = Math.max(1, ...areas.map((a) => a.users));
    areas.forEach((a) => {
      const r = 8 + (a.users / max) * 22;
      lib
        .circleMarker([a.lat, a.lng], { radius: r, color: '#1d4ed8', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.45 })
        .addTo(map)
        .bindTooltip(`${areaName(a.lat, a.lng)}: ${a.users} pengguna`);
    });
    if (areas.length > 1) map.fitBounds(areas.map((a) => [a.lat, a.lng] as [number, number]), { padding: [30, 30], maxZoom: 11 });
    return () => map.remove();
  }, [lib, areas]);

  if (failed) {
    return <div className="h-72 flex items-center justify-center text-sm text-slate-400">Peta gagal dimuat. Tabel di samping tetap benar.</div>;
  }
  return <div ref={ref} className="h-72 rounded-xl overflow-hidden border border-slate-200 bg-slate-100" />;
}

// ---------- grafik SVG sederhana ----------
function LineChart({
  labels,
  lines,
}: {
  labels: string[];
  lines: { name: string; color: string; values: number[] }[];
}) {
  const W = 640;
  const H = 190;
  const pad = { l: 34, r: 10, t: 10, b: 24 };
  const max = Math.max(1, ...lines.flatMap((l) => l.values));
  const x = (i: number) => pad.l + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
              {t}
            </text>
          </g>
        ))}
        {lines.map((l) => (
          <polyline
            key={l.name}
            fill="none"
            stroke={l.color}
            strokeWidth="2"
            strokeLinejoin="round"
            points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
        {[0, Math.floor((labels.length - 1) / 2), labels.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#94a3b8">
            {labels[i]}
          </text>
        ))}
      </svg>
      <div className="flex gap-4 mt-1">
        {lines.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className="w-3 h-0.5 rounded" style={{ background: l.color }} /> {l.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ labels, values, color }: { labels: string[]; values: number[]; color: string }) {
  const W = 640;
  const H = 190;
  const pad = { l: 34, r: 10, t: 10, b: 24 };
  const max = Math.max(1, ...values);
  const bw = (W - pad.l - pad.r) / Math.max(values.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
      {[0, 0.5, 1].map((t) => {
        const yy = pad.t + (1 - t) * (H - pad.t - pad.b);
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="#e2e8f0" />
            <text x={pad.l - 6} y={yy + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
              {Math.round(max * t)}
            </text>
          </g>
        );
      })}
      {values.map((v, i) => {
        const h = (v / max) * (H - pad.t - pad.b);
        return (
          <rect key={i} x={pad.l + i * bw + bw * 0.15} y={H - pad.b - h} width={bw * 0.7} height={h} rx="2" fill={color}>
            <title>{`${labels[i]}: ${v}`}</title>
          </rect>
        );
      })}
      {[0, Math.floor((labels.length - 1) / 2), labels.length - 1].map((i) => (
        <text key={i} x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#94a3b8">
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABEL: Record<number, string> = { 0: 'Min', 1: 'Sen', 2: 'Sel', 3: 'Rab', 4: 'Kam', 5: 'Jum', 6: 'Sab' };

function Card({ title, hint, children, className = '' }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-5 break-inside-avoid ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function AnalitikPage() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [retention, setRetention] = useState<Retention | null>(null);
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [hours, setHours] = useState<HourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [testOpen, setTestOpen] = useState(false);
  const [testSearch, setTestSearch] = useState('');
  const [testUsers, setTestUsers] = useState<TestUser[]>([]);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    async function run() {
      const [o, s, r, a, h] = await Promise.all([
        supabase.rpc('admin_analytics_overview', { p_days: days }),
        supabase.rpc('admin_analytics_series', { p_days: days }),
        supabase.rpc('admin_analytics_retention'),
        supabase.rpc('admin_analytics_areas', { p_days: days }),
        supabase.rpc('admin_analytics_hours', { p_days: days }),
      ]);
      if (!alive) return;
      if (o.error) setError(`Gagal memuat analitik: ${o.error.message}`);
      else {
        setError(null);
        setOverview(o.data as Overview);
      }
      if (!s.error) setSeries((s.data as SeriesRow[]) ?? []);
      if (!r.error) setRetention(r.data as Retention);
      if (!a.error) setAreas((a.data as AreaRow[]) ?? []);
      if (!h.error) setHours((h.data as HourRow[]) ?? []);
      setLoading(false);
    }
    run();
    return () => {
      alive = false;
    };
  }, [days, reloadKey]);

  useEffect(() => {
    if (!testOpen) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('admin_test_accounts_list', { p_search: testSearch || null });
      if (!alive) return;
      setTestUsers((data as TestUser[]) ?? []);
      setTestLoading(false);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [testOpen, testSearch]);

  async function toggleTest(u: TestUser) {
    const { data, error: err } = await supabase.rpc('admin_set_test_account', { p_user: u.id, p_is_test: !u.is_test });
    const res = data as { success?: boolean } | null;
    if (err || !res?.success) {
      alert(`Gagal: ${err?.message ?? 'tidak diketahui'}`);
      return;
    }
    setTestUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_test: !u.is_test } : x)));
    setReloadKey((k) => k + 1);
  }

  const labels = useMemo(
    () => series.map((s) => new Date(s.day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })),
    [series]
  );

  const heat = useMemo(() => {
    const m = new Map<string, number>();
    hours.forEach((h) => m.set(`${h.dow}-${h.hour}`, h.orders));
    return { m, max: Math.max(1, ...hours.map((h) => h.orders)) };
  }, [hours]);

  const areaRows = useMemo(() => {
    const grouped = new Map<string, { name: string; users: number; opens: number }>();
    areas.forEach((a) => {
      const name = areaName(a.lat, a.lng);
      const cur = grouped.get(name) ?? { name, users: 0, opens: 0 };
      cur.users += a.users;
      cur.opens += a.opens;
      grouped.set(name, cur);
    });
    return [...grouped.values()].sort((a, b) => b.users - a.users);
  }, [areas]);

  function exportCsv() {
    if (!overview) return;
    csvDownload(`pimpim_harian_${days}hari.csv`, [
      ['Tanggal', 'Pendaftar baru', 'Pengguna aktif', 'Pesanan', 'Pesanan selesai', 'Nilai trip (Rp)'],
      ...series.map((s) => [s.day, s.new_users, s.active_users, s.orders, s.completed, s.gmv]),
    ]);
  }

  const o = overview;
  const stickiness = o && o.mau > 0 ? `${Math.round((o.dau / o.mau) * 100)}%` : '-';
  const completionRate = o ? pct(o.orders_completed, o.orders_total) : '-';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Laporan Investor</h2>
          <p className="text-sm text-slate-500 mt-1">
            Pertumbuhan, keaktifan, retensi, transaksi, dan sebaran wilayah. Akun uji coba dan admin tidak dihitung.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <select
            value={days}
            onChange={(e) => {
              setLoading(true);
              setDays(Number(e.target.value));
            }}
            className="text-xs font-semibold rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700"
          >
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
            <option value={365}>1 tahun</option>
          </select>
          <button
            onClick={() => {
              setTestLoading(true);
              setTestOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FlaskConical className="w-3.5 h-3.5" /> Akun uji coba ({o?.test_accounts ?? 0})
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" /> Ekspor CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
          >
            <Printer className="w-3.5 h-3.5" /> Cetak / PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {error}
            <div className="text-xs text-rose-600/80 mt-0.5">Pastikan SQL &quot;Part AT&quot; sudah dijalankan di Supabase SQL Editor.</div>
          </div>
        </div>
      )}

      {o && (
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 leading-relaxed">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {o.tracking_since
              ? `Pencatatan keaktifan dan wilayah berjalan sejak ${new Date(o.tracking_since).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}. Angka pengguna aktif, retensi, dan wilayah hanya mencakup sejak tanggal itu. Total pengguna, pendaftar, dan transaksi mencakup seluruh periode yang dipilih.`
              : 'Pencatatan keaktifan belum menerima data. Pasang versi aplikasi terbaru, lalu buka aplikasi di HP. Angka aktif, retensi, dan wilayah akan terisi setelahnya.'}
          </span>
        </div>
      )}

      {loading || !o ? (
        <div className="py-24 flex justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total pengguna', value: nf.format(o.total_users), hint: 'Akun terdaftar', icon: Users },
              { label: `Pendaftar baru (${days} hari)`, value: nf.format(o.new_users), hint: 'Akun baru di periode ini', icon: UserPlus },
              { label: 'Aktif bulanan (MAU)', value: nf.format(o.mau), hint: `Mingguan ${nf.format(o.wau)}, harian ${nf.format(o.dau)}`, icon: Activity },
              { label: 'Rasio harian / bulanan', value: stickiness, hint: 'Seberapa sering pengguna kembali', icon: Activity },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">{k.label}</span>
                  <k.icon className="w-4 h-4 text-slate-400" />
                </div>
                <div className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{k.value}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{k.hint}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Pendaftar baru dan pengguna aktif per hari" hint="Pengguna aktif = akun yang membuka aplikasi pada hari itu">
              <LineChart
                labels={labels}
                lines={[
                  { name: 'Pengguna aktif', color: '#2563eb', values: series.map((s) => s.active_users) },
                  { name: 'Pendaftar baru', color: '#059669', values: series.map((s) => s.new_users) },
                ]}
              />
            </Card>
            <Card title="Pesanan per hari" hint="Semua pesanan yang dibuat penumpang, termasuk yang batal">
              <BarChart labels={labels} values={series.map((s) => s.orders)} color="#3b82f6" />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Retensi pengguna" hint="Dari pendaftar sejak pencatatan dimulai, berapa yang membuka aplikasi lagi tepat pada hari ke-N" className="lg:col-span-1">
              <div className="space-y-4">
                {([
                  ['d1', 'Hari ke-1'],
                  ['d7', 'Hari ke-7'],
                  ['d30', 'Hari ke-30'],
                ] as ['d1' | 'd7' | 'd30', string][]).map(([k, label]) => {
                  const c = retention?.[k];
                  const eligible = c?.eligible ?? 0;
                  const ratio = eligible > 0 ? (c?.retained ?? 0) / eligible : 0;
                  return (
                    <div key={k}>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold text-slate-800">{label}</span>
                        <span className="tabular-nums text-slate-900 font-bold">{eligible > 0 ? pct(c?.retained ?? 0, eligible) : 'Belum cukup data'}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {eligible > 0 ? `${c?.retained ?? 0} dari ${eligible} pendaftar` : 'Menunggu pendaftar yang sudah cukup lama'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Transaksi" hint={`Periode ${days} hari terakhir`} className="lg:col-span-2">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                {[
                  ['Total pesanan', nf.format(o.orders_total)],
                  ['Pesanan selesai', `${nf.format(o.orders_completed)} (${completionRate})`],
                  ['Dibatalkan', `${nf.format(o.orders_cancelled)} (${pct(o.orders_cancelled, o.orders_total)})`],
                  ['Nilai trip total', rp(o.gmv)],
                  ['Rata-rata tarif', rp(o.avg_price)],
                  ['Rata-rata jarak', `${o.avg_km} km`],
                  ['Komisi', rp(o.commission)],
                  ['Biaya platform', rp(o.platform_fee)],
                  ['Penumpang berulang', `${nf.format(o.repeat_riders)} dari ${nf.format(o.riders)} (${pct(o.repeat_riders, o.riders)})`],
                  ['Driver aktif terverifikasi', nf.format(o.drivers_approved)],
                  ['Sobat Tolongin aktif', nf.format(o.sobat_active)],
                  ['Kedaluwarsa (tanpa driver)', nf.format(o.orders_expired)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-slate-400">{k}</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5 tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <Card title="Sebaran wilayah pengguna" hint="Lokasi kasar (sekitar 1 km) saat aplikasi dibuka. Dikelompokkan per kotak sekitar 11 km, diberi nama kota terdekat.">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3">
                {areas.length === 0 ? (
                  <div className="h-72 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-sm text-slate-400 text-center px-6">
                    Belum ada data wilayah. Data muncul setelah pengguna membuka versi aplikasi terbaru dengan izin lokasi aktif.
                  </div>
                ) : (
                  <AreaMap areas={areas} />
                )}
              </div>
              <div className="lg:col-span-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400 text-left">
                      <th className="py-2 font-semibold">Wilayah</th>
                      <th className="py-2 font-semibold text-right">Pengguna</th>
                      <th className="py-2 font-semibold text-right">Dibuka</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {areaRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-xs text-slate-400">
                          -
                        </td>
                      </tr>
                    ) : (
                      areaRows.slice(0, 12).map((r) => (
                        <tr key={r.name}>
                          <td className="py-2 text-slate-800">{r.name}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">{r.users}</td>
                          <td className="py-2 text-right text-slate-500 tabular-nums">{r.opens}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card title="Jam sibuk pesanan" hint="Jumlah pesanan menurut hari dan jam (waktu Jakarta). Makin pekat makin ramai.">
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid" style={{ gridTemplateColumns: '36px repeat(24, minmax(0, 1fr))', gap: 2 }}>
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-[9px] text-slate-400 text-center">
                      {h % 3 === 0 ? h : ''}
                    </div>
                  ))}
                  {DOW_ORDER.map((d) => (
                    <React.Fragment key={d}>
                      <div className="text-[10px] text-slate-500 pr-1 flex items-center">{DOW_LABEL[d]}</div>
                      {Array.from({ length: 24 }, (_, h) => {
                        const v = heat.m.get(`${d}-${h}`) ?? 0;
                        return (
                          <div
                            key={h}
                            title={`${DOW_LABEL[d]} ${h}.00: ${v} pesanan`}
                            className="h-5 rounded-[3px]"
                            style={{ background: v === 0 ? '#f1f5f9' : `rgba(37, 99, 235, ${0.15 + (v / heat.max) * 0.85})` }}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Catatan metodologi: pengguna aktif dihitung dari akun yang membuka aplikasi (maks. sekali per 30 menit). Nilai trip adalah kesepakatan tarif di aplikasi;
            pembayaran dilakukan tunai antara penumpang dan driver. Akun uji coba dan admin dikecualikan dari semua angka.
          </p>
        </>
      )}

      {testOpen && (
        <div className="fixed inset-0 z-50 flex justify-end print:hidden">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={() => setTestOpen(false)} />
          <aside className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col">
            <div className="px-6 h-16 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-900">Akun uji coba</h3>
              <button onClick={() => setTestOpen(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-4 border-b border-slate-100">
              <p className="text-xs text-slate-500 leading-relaxed">
                Centang akun milikmu, tim, atau tester. Akun yang dicentang dikecualikan dari semua angka di Laporan Investor, supaya data hanya berisi pengguna asli.
              </p>
              <div className="relative mt-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={testSearch}
                  onChange={(e) => {
                    setTestLoading(true);
                    setTestSearch(e.target.value);
                  }}
                  placeholder="Cari nama, email, atau nomor HP"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {testLoading ? (
                <div className="py-16 flex justify-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {testUsers.map((u) => (
                    <li key={u.id} className="px-6 py-3 flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={u.is_test || u.is_admin}
                        disabled={u.is_admin}
                        onChange={() => toggleTest(u)}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">{u.name ?? 'Tanpa nama'}</div>
                        <div className="text-xs text-slate-400 truncate">{u.email ?? u.phone ?? '-'}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {u.is_admin && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-white">Admin</span>}
                        {u.is_driver && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Driver</span>}
                        {u.is_sobat && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Sobat</span>}
                      </div>
                    </li>
                  ))}
                  {testUsers.length === 0 && <li className="py-12 text-center text-sm text-slate-400">Tidak ada akun yang cocok.</li>}
                </ul>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-200 text-[11px] text-slate-400">
              Akun admin otomatis dikecualikan dan tidak bisa diubah di sini.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}