'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Search,
  X,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Bike,
  Car,
  Wallet,
  ExternalLink,
  AlertTriangle,
  FileText,
} from 'lucide-react';

type VerifStatus = 'pending' | 'approved' | 'rejected';

interface Driver {
  id: string;
  full_name: string | null;
  phone: string | null;
  vehicle_type: string | null;
  car_class: string | null;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  verification_status: VerifStatus | null;
  is_online: boolean | null;
  is_engaged: boolean | null;
  credit_balance: number | null;
  credit_limit: number | null;
  thumbs_up_count: number | null;
  thumbs_down_count: number | null;
  docs_total: number;
  docs_approved: number;
  docs_pending: number;
  docs_rejected: number;
  trips_completed: number;
  reports_against: number;
  deactivation_kind: 'temporary' | 'permanent' | null;
  deactivation_reason: string | null;
  deactivation_note: string | null;
  deactivated_at: string | null;
}

interface DriverDoc {
  document_type: string;
  file_url: string | null;
  status: string;
  rejection_reason: string | null;
}

interface CreditRow {
  id: number;
  amount: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

interface TripRow {
  id: string;
  service_type: string | null;
  status: string;
  pickup_address: string | null;
  destination_address: string | null;
  distance_km: number | null;
  price: number | null;
  passenger_name: string | null;
  created_at: string;
}

type Tab = 'verifikasi' | 'kendaraan' | 'saldo' | 'trip';

const DOC_LABEL: Record<string, string> = {
  ktp: 'KTP',
  sim: 'SIM',
  stnk: 'STNK',
  vehicle_photo: 'Foto Kendaraan',
};

const REJECT_PRESETS = ['Foto buram atau tidak terbaca', 'Dokumen sudah kedaluwarsa', 'Bukan dokumen yang diminta', 'Data tidak cocok dengan akun'];

type Phase = 'pending' | 'active' | 'rejected' | 'paused' | 'banned';

const PHASE_META: Record<Phase, { label: string; chip: string }> = {
  pending: { label: 'Menunggu', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  active: { label: 'Aktif', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Ditolak', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  paused: { label: 'Nonaktif sementara', chip: 'bg-orange-50 text-orange-700 border-orange-200' },
  banned: { label: 'Diblokir permanen', chip: 'bg-rose-100 text-rose-800 border-rose-300' },
};

const DEACT_REASONS: { code: string; label: string; heavy: boolean }[] = [
  { code: 'criminal', label: 'Tindak kriminal', heavy: true },
  { code: 'violence', label: 'Kekerasan atau pelecehan', heavy: true },
  { code: 'fraud', label: 'Penipuan atau manipulasi', heavy: true },
  { code: 'fake_docs', label: 'Dokumen palsu', heavy: true },
  { code: 'complaints', label: 'Komplain berulang', heavy: false },
  { code: 'rude', label: 'Perilaku tidak sopan', heavy: false },
  { code: 'inactive', label: 'Tidak aktif', heavy: false },
  { code: 'own_request', label: 'Permintaan sendiri', heavy: false },
  { code: 'other', label: 'Lainnya', heavy: false },
];

function reasonLabel(code: string | null) {
  return DEACT_REASONS.find((r) => r.code === code)?.label ?? code ?? '-';
}

const TRIP_STATUS: Record<string, string> = {
  completed: 'Selesai',
  cancelled_by_passenger: 'Batal (penumpang)',
  cancelled_by_driver: 'Batal (driver)',
  expired: 'Kedaluwarsa',
  in_trip: 'Berjalan',
  driver_assigned: 'Menuju jemput',
  driver_arrived: 'Driver tiba',
  searching: 'Mencari driver',
};

function rp(n: number | null | undefined) {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n ?? 0));
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function statusOf(d: Driver): VerifStatus {
  return (d.verification_status ?? 'pending') as VerifStatus;
}

function phaseOf(d: Driver): Phase {
  const st = statusOf(d);
  if (st === 'approved') return 'active';
  if (st === 'pending') return 'pending';
  if (d.deactivation_kind === 'permanent') return 'banned';
  if (d.deactivation_kind === 'temporary') return 'paused';
  return 'rejected';
}

function tint(tone: string) {
  if (tone.includes('amber')) return 'from-[#f9e6c6] to-[#efcd96]';
  if (tone.includes('rose')) return 'from-[#f7d9de] to-[#ebb0ba]';
  if (tone.includes('emerald')) return 'from-[#c6ebe1] to-[#98d4c9]';
  if (tone.includes('blue')) return 'from-[#d9e8f4] to-[#b6d0e4]';
  return 'from-[#e8edf4] to-[#cfd9e6]';
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [statusFilter, setStatusFilter] = useState<'all' | Phase>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ride' | 'car'>('all');
  const [query, setQuery] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('verifikasi');
  const [detailKey, setDetailKey] = useState(0);
  const [docs, setDocs] = useState<DriverDoc[]>([]);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [creditLog, setCreditLog] = useState<CreditRow[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deactOpen, setDeactOpen] = useState(false);
  const [deactReason, setDeactReason] = useState('');
  const [deactKind, setDeactKind] = useState<'temporary' | 'permanent'>('temporary');
  const [deactNote, setDeactNote] = useState('');
  const [banOpen, setBanOpen] = useState(false);
  const [banConfirm, setBanConfirm] = useState('');
  const [banNote, setBanNote] = useState('');
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');

  const selected = drivers.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    let alive = true;
    async function run() {
      const { data, error: err } = await supabase.rpc('admin_drivers_list');
      if (!alive) return;
      if (err) setError(`Gagal memuat driver: ${err.message}`);
      else {
        setError(null);
        setDrivers((data as Driver[]) ?? []);
      }
      setLoading(false);
      setRefreshing(false);
    }
    run();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    async function run() {
      const [docRes, logRes, tripRes] = await Promise.all([
        supabase.rpc('admin_driver_docs', { p_driver: selectedId }),
        supabase.rpc('admin_driver_credit_log', { p_driver: selectedId, p_limit: 50 }),
        supabase.rpc('admin_driver_trips', { p_driver: selectedId, p_limit: 40 }),
      ]);
      const docList = ((docRes.data as DriverDoc[]) ?? []).filter(Boolean);
      const urls: Record<string, string> = {};
      await Promise.all(
        docList.map(async (d) => {
          if (!d.file_url) return;
          if (d.file_url.startsWith('http')) {
            urls[d.document_type] = d.file_url;
            return;
          }
          const { data } = await supabase.storage.from('driver-kyc').createSignedUrl(d.file_url, 600);
          if (data?.signedUrl) urls[d.document_type] = data.signedUrl;
        })
      );
      if (!alive) return;
      setDocs(docList);
      setDocUrls(urls);
      setCreditLog((logRes.data as CreditRow[]) ?? []);
      setTrips((tripRes.data as TripRow[]) ?? []);
      setDetailLoading(false);
    }
    run();
    return () => {
      alive = false;
    };
  }, [selectedId, detailKey]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  function openDriver(d: Driver) {
    setSelectedId(d.id);
    setTab('verifikasi');
    setDocs([]);
    setDocUrls({});
    setCreditLog([]);
    setTrips([]);
    setRejecting(null);
    setRejectReason('');
    setTopupAmount('');
    setTopupNote('');
    setDetailLoading(true);
    setDetailKey((k) => k + 1);
  }

  function reloadAll() {
    setReloadKey((k) => k + 1);
    setDetailKey((k) => k + 1);
  }

  async function reviewDoc(driver: Driver, type: string, status: 'approved' | 'rejected', reason?: string) {
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_review_document', {
      p_driver: driver.id,
      p_type: type,
      p_status: status,
      p_reason: reason ?? null,
    });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (err || !res?.success) {
      alert(`Gagal: ${err?.message ?? res?.message ?? 'tidak diketahui'}`);
      return;
    }
    setRejecting(null);
    setRejectReason('');
    reloadAll();
  }

  async function setDriverStatus(driver: Driver, status: VerifStatus) {
    if (status === 'approved' && driver.docs_approved < Math.max(driver.docs_total, 1)) {
      const ok = window.confirm(
        `Baru ${driver.docs_approved} dari ${driver.docs_total} dokumen yang disetujui. Tetap aktifkan ${driver.full_name ?? 'driver ini'}?`
      );
      if (!ok) return;
    }
    if (status === 'rejected') {
      const ok = window.confirm(
        `Nonaktifkan ${driver.full_name ?? 'driver ini'}? Dia akan otomatis offline dan tidak bisa menerima order.`
      );
      if (!ok) return;
    }
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_set_driver_status', {
      p_driver: driver.id,
      p_status: status,
    });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (err || !res?.success) {
      alert(`Gagal: ${err?.message ?? res?.message ?? 'tidak diketahui'}`);
      return;
    }
    reloadAll();
  }

  function openDeactivate() {
    setDeactReason('');
    setDeactKind('temporary');
    setDeactNote('');
    setDeactOpen(true);
  }

  const deactHeavy = DEACT_REASONS.find((r) => r.code === deactReason)?.heavy ?? false;
  const deactEffectiveKind = deactHeavy ? 'permanent' : deactKind;
  const deactNeedsNote = deactEffectiveKind === 'permanent' || deactReason === 'other';
  const deactReady = !!deactReason && (!deactNeedsNote || deactNote.trim().length >= 5);

  async function submitDeactivate() {
    if (!selected || !deactReady) return;
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_driver_deactivate', {
      p_driver: selected.id,
      p_kind: deactEffectiveKind,
      p_reason: deactReason,
      p_note: deactNote.trim() || null,
    });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (err || !res?.success) {
      alert(`Gagal: ${err?.message ?? res?.message ?? 'tidak diketahui'}`);
      return;
    }
    setDeactOpen(false);
    reloadAll();
  }

  async function submitUnban() {
    if (!selected) return;
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_driver_unban', {
      p_driver: selected.id,
      p_confirm: banConfirm,
      p_note: banNote,
    });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (err || !res?.success) {
      alert(`Gagal: ${err?.message ?? res?.message ?? 'tidak diketahui'}`);
      return;
    }
    setBanOpen(false);
    setBanConfirm('');
    setBanNote('');
    reloadAll();
  }

  async function setCarClass(driver: Driver, cls: 'small' | 'large') {
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_set_driver_car_class', {
      p_driver: driver.id,
      p_class: cls,
    });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (err || !res?.success) {
      alert(`Gagal: ${err?.message ?? res?.message ?? 'tidak diketahui'}`);
      return;
    }
    reloadAll();
  }

  async function submitTopup(driver: Driver) {
    const amount = Number(topupAmount.replace(/[^0-9-]/g, ''));
    if (!amount) {
      alert('Isi nominal dulu (angka negatif untuk koreksi pengurangan).');
      return;
    }
    const ok = window.confirm(
      `${amount > 0 ? 'Tambah' : 'Kurangi'} saldo ${driver.full_name ?? 'driver'} sebesar ${rp(Math.abs(amount))}?\nCatatan: ${topupNote || '(kosong)'}`
    );
    if (!ok) return;
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_topup_driver', {
      p_driver: driver.id,
      p_amount: amount,
      p_note: topupNote,
    });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (err || !res?.success) {
      alert(`Gagal: ${err?.message ?? res?.message ?? 'tidak diketahui'}`);
      return;
    }
    setTopupAmount('');
    setTopupNote('');
    reloadAll();
  }

  const counts = useMemo(() => {
    const c = { pending: 0, active: 0, rejected: 0, paused: 0, banned: 0, online: 0 };
    drivers.forEach((d) => {
      c[phaseOf(d)] += 1;
      if (phaseOf(d) === 'active' && d.is_online) c.online += 1;
    });
    return c;
  }, [drivers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers.filter((d) => {
      if (statusFilter === 'rejected') {
        if (phaseOf(d) !== 'rejected' && phaseOf(d) !== 'paused') return false;
      } else if (statusFilter !== 'all' && phaseOf(d) !== statusFilter) return false;
      if (typeFilter !== 'all' && d.vehicle_type !== typeFilter) return false;
      if (!q) return true;
      return (
        (d.full_name ?? '').toLowerCase().includes(q) ||
        (d.phone ?? '').includes(q) ||
        (d.vehicle_plate ?? '').toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, ''))
      );
    });
  }, [drivers, statusFilter, typeFilter, query]);

  const cards: { key: 'all' | Phase; label: string; value: number; tone: string }[] = [
    { key: 'pending', label: 'Menunggu verifikasi', value: counts.pending, tone: 'text-amber-600' },
    { key: 'active', label: `Aktif (${counts.online} online)`, value: counts.active, tone: 'text-emerald-600' },
    { key: 'rejected', label: 'Ditolak / nonaktif', value: counts.rejected + counts.paused, tone: 'text-blue-600' },
    { key: 'banned', label: 'Diblokir permanen', value: counts.banned, tone: 'text-rose-600' },
    { key: 'all', label: 'Semua driver', value: drivers.length, tone: 'text-slate-900' },
  ];

  const belowLimit = (d: Driver) => (d.credit_balance ?? 0) <= (d.credit_limit ?? -20000);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Driver Pim Ride dan Pim Car</h2>
          <p className="text-sm text-slate-500 mt-1">
            Verifikasi pendaftar, kelola kendaraan dan saldo, serta pantau riwayat trip setiap driver.
          </p>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            setReloadKey((k) => k + 1);
          }}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-60 transition w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {error}
            <div className="text-xs text-rose-600/80 mt-0.5">Pastikan SQL &quot;Part AQ&quot; sudah dijalankan di Supabase SQL Editor.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => setStatusFilter(c.key)}
            className={`text-left rounded-[22px] p-5 bg-gradient-to-br ${tint(c.tone)} transition shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)] ${
              statusFilter === c.key ? 'ring-2 ring-[#2f7088]' : 'hover:brightness-105'
            }`}
          >
            <div className="text-xs font-semibold text-slate-600">{c.label}</div>
            <div className={`mt-1.5 text-2xl font-extrabold tabular-nums text-slate-800`}>{loading ? '-' : c.value}</div>
          </button>
        ))}
      </div>

      <section className="bg-white/90 border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.3)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, nomor HP, atau plat"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-full border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'ride' | 'car')}
            className="text-sm rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">Motor dan mobil</option>
            <option value="ride">Motor (Pim Ride)</option>
            <option value="car">Mobil (Pim Car)</option>
          </select>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Memuat driver...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400">Tidak ada driver yang cocok dengan filter ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                  <th className="px-5 py-3 font-semibold">Driver</th>
                  <th className="px-3 py-3 font-semibold">Kendaraan</th>
                  <th className="px-3 py-3 font-semibold">Verifikasi</th>
                  <th className="px-3 py-3 font-semibold">Dokumen</th>
                  <th className="px-3 py-3 font-semibold text-right">Saldo</th>
                  <th className="px-3 py-3 font-semibold text-right">Trip</th>
                  <th className="px-5 py-3 font-semibold">Penilaian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((d) => {
                  const st = statusOf(d);
                  return (
                    <tr key={d.id} onClick={() => openDriver(d)} className="hover:bg-slate-50/70 cursor-pointer transition">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${st === 'approved' && d.is_online ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            title={d.is_online ? 'Online' : 'Offline'}
                          />
                          <div>
                            <div className="font-semibold text-slate-900">{d.full_name ?? 'Tanpa nama'}</div>
                            <div className="text-xs text-slate-400">{d.phone ?? '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-800">
                          {d.vehicle_type === 'car' ? <Car className="w-3.5 h-3.5 text-slate-400" /> : <Bike className="w-3.5 h-3.5 text-slate-400" />}
                          <span className="font-medium">{d.vehicle_plate ?? '-'}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {d.vehicle_model ?? '-'}
                          {d.vehicle_type === 'car' && ` - Kelas ${d.car_class === 'large' ? 'Besar' : 'Kecil'}`}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${PHASE_META[phaseOf(d)].chip}`}>
                          {PHASE_META[phaseOf(d)].label}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-xs">
                        <span className="text-slate-700 font-medium">
                          {d.docs_approved}/{d.docs_total}
                        </span>
                        <span className="text-slate-400"> disetujui</span>
                        {d.docs_pending > 0 && <div className="text-amber-600 font-medium">{d.docs_pending} perlu dicek</div>}
                        {d.docs_rejected > 0 && <div className="text-rose-600 font-medium">{d.docs_rejected} ditolak</div>}
                      </td>
                      <td className={`px-3 py-3.5 text-right font-semibold tabular-nums ${belowLimit(d) ? 'text-rose-600' : 'text-slate-900'}`}>
                        {rp(d.credit_balance)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-700">{d.trips_completed}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <span className="text-emerald-600 font-semibold">{d.thumbs_up_count ?? 0}</span> positif
                        <span className="text-slate-300"> / </span>
                        <span className="text-rose-600 font-semibold">{d.thumbs_down_count ?? 0}</span> negatif
                        {d.reports_against > 0 && <div className="text-rose-600 font-medium">{d.reports_against} laporan</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={() => setSelectedId(null)} />
          <aside className="relative w-full max-w-2xl bg-[#f6f8fc] h-full shadow-2xl flex flex-col sm:rounded-l-3xl overflow-hidden">
            <div className="px-6 pt-5 pb-0 border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-900 truncate">{selected.full_name ?? 'Tanpa nama'}</h3>
                    <span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${PHASE_META[phaseOf(selected)].chip}`}>
                      {PHASE_META[phaseOf(selected)].label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {selected.phone ?? '-'} - {selected.vehicle_type === 'car' ? 'Pim Car' : 'Pim Ride'} - {selected.vehicle_plate ?? '-'}
                  </div>
                </div>
                <button onClick={() => setSelectedId(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-1 mt-4 -mb-px">
                {([
                  ['verifikasi', 'Verifikasi'],
                  ['kendaraan', 'Kendaraan'],
                  ['saldo', 'Saldo'],
                  ['trip', 'Riwayat trip'],
                ] as [Tab, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 transition ${
                      tab === k ? 'border-[#2f7088] text-[#2f7088]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {detailLoading ? (
                <div className="py-16 flex justify-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : tab === 'verifikasi' ? (
                <div className="space-y-4">
                  {docs.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">Driver ini belum mengunggah dokumen.</p>
                  ) : (
                    docs.map((doc) => (
                      <div key={doc.document_type} className="rounded-2xl border border-white bg-white shadow-sm overflow-hidden">
                        <div className="px-4 py-3 flex items-center justify-between bg-slate-50 border-b border-slate-100">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <FileText className="w-4 h-4 text-slate-400" />
                            {DOC_LABEL[doc.document_type] ?? doc.document_type}
                          </div>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                              doc.status === 'approved'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : doc.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {doc.status === 'approved' ? 'Disetujui' : doc.status === 'rejected' ? 'Ditolak' : 'Perlu dicek'}
                          </span>
                        </div>
                        <div className="p-4 flex gap-4 flex-col sm:flex-row">
                          {docUrls[doc.document_type] ? (
                            <a href={docUrls[doc.document_type]} target="_blank" rel="noreferrer" className="block shrink-0 group relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={docUrls[doc.document_type]}
                                alt={DOC_LABEL[doc.document_type] ?? doc.document_type}
                                className="w-full sm:w-44 h-32 object-cover rounded-lg border border-slate-200 bg-slate-100"
                              />
                              <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-900/80 text-white px-1.5 py-0.5 rounded">
                                <ExternalLink className="w-3 h-3" /> Perbesar
                              </span>
                            </a>
                          ) : (
                            <div className="w-full sm:w-44 h-32 rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 flex items-center justify-center text-center px-3 shrink-0">
                              Gambar tidak tersedia
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {doc.status === 'rejected' && doc.rejection_reason && (
                              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 mb-3">
                                Alasan penolakan: {doc.rejection_reason}
                              </p>
                            )}
                            {rejecting === doc.document_type ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                  {REJECT_PRESETS.map((p) => (
                                    <button
                                      key={p}
                                      onClick={() => setRejectReason(p)}
                                      className="text-[11px] px-2 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </div>
                                <textarea
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  rows={2}
                                  placeholder="Alasan yang akan dibaca driver"
                                  className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
                                />
                                <div className="flex gap-2">
                                  <button
                                    disabled={busy}
                                    onClick={() => reviewDoc(selected, doc.document_type, 'rejected', rejectReason)}
                                    className="px-4 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-60"
                                  >
                                    Kirim penolakan
                                  </button>
                                  <button
                                    onClick={() => setRejecting(null)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                                  >
                                    Batal
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  disabled={busy || doc.status === 'approved'}
                                  onClick={() => reviewDoc(selected, doc.document_type, 'approved')}
                                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-40"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Setujui
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    setRejecting(doc.document_type);
                                    setRejectReason('');
                                  }}
                                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold disabled:opacity-40"
                                >
                                  <XCircle className="w-3.5 h-3.5" /> Tolak
                                </button>
                              </div>
                            )}
                            <p className="text-[11px] text-slate-400 mt-3">
                              Penolakan dikirim sebagai notifikasi ke driver, lalu dia bisa mengunggah ulang dokumen itu.
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : tab === 'kendaraan' ? (
                <div className="space-y-5">
                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs text-slate-400">Jenis</dt>
                      <dd className="font-semibold text-slate-900 mt-0.5">{selected.vehicle_type === 'car' ? 'Mobil (Pim Car)' : 'Motor (Pim Ride)'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Plat nomor</dt>
                      <dd className="font-semibold text-slate-900 mt-0.5">{selected.vehicle_plate ?? '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Model</dt>
                      <dd className="text-slate-800 mt-0.5">{selected.vehicle_model ?? '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Status sekarang</dt>
                      <dd className="text-slate-800 mt-0.5">
                        {selected.is_engaged ? 'Sedang narik' : selected.is_online ? 'Online' : 'Offline'}
                      </dd>
                    </div>
                  </dl>

                  {selected.vehicle_type === 'car' ? (
                    <div className="rounded-2xl border border-white bg-white shadow-sm p-4">
                      <div className="text-sm font-semibold text-slate-900">Kelas mobil</div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Kecil untuk 4 kursi, Besar untuk 6 sampai 7 kursi. Driver Besar boleh menerima order Kecil, tapi driver Kecil tidak bisa menerima order Besar.
                      </p>
                      <div className="mt-3 flex gap-2">
                        {(['small', 'large'] as const).map((c) => (
                          <button
                            key={c}
                            disabled={busy || selected.car_class === c}
                            onClick={() => setCarClass(selected, c)}
                            className={`px-5 py-2 rounded-full text-xs font-semibold border transition ${
                              (selected.car_class ?? 'small') === c
                                ? 'bg-gradient-to-b from-[#4a98ad] to-[#2f7088] border-transparent text-white shadow-md'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {c === 'small' ? 'Kecil' : 'Besar'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Motor tidak punya kelas.</p>
                  )}

                  <div className="rounded-2xl border border-white bg-white shadow-sm p-4">
                    <div className="text-sm font-semibold text-slate-900">Akses driver</div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Menonaktifkan driver membuatnya offline dan tidak bisa menerima order. Dokumen dan saldonya tetap tersimpan.
                    </p>
                    {(phaseOf(selected) === 'banned' || phaseOf(selected) === 'paused') && (
                      <div
                        className={`mt-3 rounded-xl border px-3.5 py-3 text-xs leading-relaxed ${
                          phaseOf(selected) === 'banned' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-orange-200 bg-orange-50 text-orange-800'
                        }`}
                      >
                        <div className="font-semibold">
                          {phaseOf(selected) === 'banned' ? 'Diblokir permanen' : 'Dinonaktifkan sementara'}: {reasonLabel(selected.deactivation_reason)}
                        </div>
                        {selected.deactivation_note && <div className="mt-1">{selected.deactivation_note}</div>}
                        {selected.deactivated_at && <div className="mt-1 opacity-80">{fmtDateTime(selected.deactivated_at)}</div>}
                        {phaseOf(selected) === 'banned' && (
                          <div className="mt-1 opacity-80">Akun penumpangnya juga ikut diblokir. Tidak bisa diaktifkan lewat tombol biasa.</div>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {phaseOf(selected) === 'banned' ? (
                        <button
                          disabled={busy}
                          onClick={() => {
                            setBanConfirm('');
                            setBanNote('');
                            setBanOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" /> Buka blokir
                        </button>
                      ) : (
                        <>
                          {statusOf(selected) !== 'approved' && (
                            <button
                              disabled={busy}
                              onClick={() => setDriverStatus(selected, 'approved')}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Aktifkan driver
                            </button>
                          )}
                          {statusOf(selected) === 'approved' && (
                            <button
                              disabled={busy}
                              onClick={openDeactivate}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Nonaktifkan atau blokir
                            </button>
                          )}
                          {statusOf(selected) === 'pending' && (
                            <button
                              disabled={busy}
                              onClick={() => setDriverStatus(selected, 'rejected')}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Tolak pendaftaran
                            </button>
                          )}
                          {statusOf(selected) === 'approved' && (
                            <button
                              disabled={busy}
                              onClick={() => setDriverStatus(selected, 'pending')}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold disabled:opacity-50"
                            >
                              <Clock className="w-3.5 h-3.5" /> Kembalikan ke menunggu
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : tab === 'saldo' ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white bg-white shadow-sm p-4">
                      <div className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5" /> Saldo sekarang
                      </div>
                      <div className={`mt-1 text-2xl font-extrabold tabular-nums ${belowLimit(selected) ? 'text-rose-600' : 'text-slate-900'}`}>
                        {rp(selected.credit_balance)}
                      </div>
                      {belowLimit(selected) && <div className="text-[11px] text-rose-600 font-medium mt-1">Di bawah batas, tidak bisa terima order</div>}
                    </div>
                    <div className="rounded-2xl border border-white bg-white shadow-sm p-4">
                      <div className="text-xs text-slate-400">Batas minimum</div>
                      <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{rp(selected.credit_limit ?? -20000)}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white bg-white shadow-sm p-4 space-y-3">
                    <div className="text-sm font-semibold text-slate-900">Isi atau koreksi saldo</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[20000, 50000, 100000, 200000].map((v) => (
                        <button
                          key={v}
                          onClick={() => setTopupAmount(String(v))}
                          className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                        >
                          {rp(v)}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        inputMode="numeric"
                        placeholder="Nominal (negatif untuk mengurangi)"
                        className="text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <input
                        value={topupNote}
                        onChange={(e) => setTopupNote(e.target.value)}
                        placeholder="Catatan, mis. Transfer BCA 8 Okt"
                        className="text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => submitTopup(selected)}
                      className="px-5 py-2 rounded-full bg-gradient-to-b from-[#4a98ad] to-[#2f7088] hover:opacity-90 text-white text-xs font-semibold shadow-md disabled:opacity-60"
                    >
                      {busy ? 'Memproses...' : 'Simpan saldo'}
                    </button>
                    <p className="text-[11px] text-slate-400">Maksimal Rp 2.000.000 per kali. Setiap perubahan tercatat bersama nama admin.</p>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Riwayat mutasi</h4>
                    {creditLog.length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">Belum ada mutasi.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 rounded-2xl border border-white bg-white shadow-sm">
                        {creditLog.map((l) => (
                          <li key={l.id} className="px-4 py-3 flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] text-slate-800 truncate">{l.reason}</div>
                              <div className="text-[11px] text-slate-400">{fmtDateTime(l.created_at)}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`text-sm font-semibold tabular-nums ${l.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {l.amount >= 0 ? '+' : '-'}
                                {rp(Math.abs(l.amount))}
                              </div>
                              <div className="text-[11px] text-slate-400 tabular-nums">saldo {rp(l.balance_after)}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {trips.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">Belum ada trip.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-2xl border border-white bg-white shadow-sm">
                      {trips.map((t) => (
                        <li key={t.id} className="px-4 py-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {TRIP_STATUS[t.status] ?? t.status}
                            </span>
                            <span className="text-[11px] text-slate-400">{fmtDateTime(t.created_at)}</span>
                          </div>
                          <div className="mt-2 text-[13px] text-slate-800 leading-snug">
                            <div className="truncate">Jemput: {t.pickup_address ?? '-'}</div>
                            <div className="truncate">Tujuan: {t.destination_address ?? '-'}</div>
                          </div>
                          <div className="mt-1.5 text-xs text-slate-500 flex flex-wrap gap-x-4">
                            <span>Penumpang: {t.passenger_name ?? '-'}</span>
                            {t.distance_km != null && <span>{Number(t.distance_km).toFixed(1)} km</span>}
                            {t.price != null && <span className="font-semibold text-slate-700">{rp(t.price)}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {tab === 'verifikasi' && (
              <div className="px-6 py-4 border-t border-slate-200 bg-white shrink-0 flex flex-wrap items-center gap-2">
                {phaseOf(selected) === 'banned' ? (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setBanConfirm('');
                      setBanNote('');
                      setBanOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Buka blokir
                  </button>
                ) : (
                  <>
                    {statusOf(selected) !== 'approved' && (
                      <button
                        disabled={busy}
                        onClick={() => setDriverStatus(selected, 'approved')}
                        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Aktifkan driver
                      </button>
                    )}
                    {statusOf(selected) === 'pending' && (
                      <button
                        disabled={busy}
                        onClick={() => setDriverStatus(selected, 'rejected')}
                        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Tolak pendaftaran
                      </button>
                    )}
                    {statusOf(selected) === 'approved' && (
                      <button
                        disabled={busy}
                        onClick={openDeactivate}
                        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Nonaktifkan atau blokir
                      </button>
                    )}
                  </>
                )}
                <span className="ml-auto text-[11px] text-slate-400">
                  {selected.docs_approved}/{selected.docs_total} dokumen disetujui
                </span>
              </div>
            )}
          </aside>
        </div>
      )}
      {selected && deactOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => !busy && setDeactOpen(false)} />
          <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl p-6">
            <h4 className="text-base font-bold text-slate-900">Nonaktifkan {selected.full_name ?? 'driver ini'}</h4>
            <p className="text-xs text-slate-500 mt-1">Driver otomatis offline dan menerima pemberitahuan. Alasan hanya tampil di dashboard.</p>
            <div className="mt-4 text-xs font-semibold text-slate-700">Alasan</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {DEACT_REASONS.map((r) => (
                <button
                  key={r.code}
                  onClick={() => setDeactReason(r.code)}
                  className={`text-left px-3 py-2 rounded-xl border text-xs font-medium transition ${
                    deactReason === r.code
                      ? r.heavy
                        ? 'border-rose-400 bg-rose-50 text-rose-800'
                        : 'border-[#2f7088] bg-sky-50 text-slate-900'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="mt-4 text-xs font-semibold text-slate-700">Jenis tindakan</div>
            {deactHeavy ? (
              <div className="mt-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800 leading-relaxed">
                Alasan ini otomatis menjadi blokir permanen. Akun penumpangnya ikut diblokir dan tidak bisa diaktifkan dengan satu tombol.
              </div>
            ) : (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {([
                  ['temporary', 'Sementara', 'Bisa diaktifkan lagi'],
                  ['permanent', 'Blokir permanen', 'Akun penumpang ikut diblokir'],
                ] as ['temporary' | 'permanent', string, string][]).map(([k, t, sub]) => (
                  <button
                    key={k}
                    onClick={() => setDeactKind(k)}
                    className={`text-left px-3 py-2 rounded-xl border transition ${
                      deactKind === k
                        ? k === 'permanent'
                          ? 'border-rose-400 bg-rose-50'
                          : 'border-[#2f7088] bg-sky-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900">{t}</div>
                    <div className="text-[11px] text-slate-500">{sub}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 text-xs font-semibold text-slate-700">
              Catatan {deactNeedsNote ? '(wajib, minimal 5 huruf)' : '(boleh dikosongkan)'}
            </div>
            <textarea
              value={deactNote}
              onChange={(e) => setDeactNote(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Contoh: laporan penumpang tanggal 3, sudah dikonfirmasi"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={busy}
                onClick={() => setDeactOpen(false)}
                className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                disabled={busy || !deactReady}
                onClick={submitDeactivate}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-40"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {deactEffectiveKind === 'permanent' ? 'Blokir permanen' : 'Nonaktifkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && banOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => !busy && setBanOpen(false)} />
          <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl p-6">
            <h4 className="text-base font-bold text-rose-700">Buka blokir permanen</h4>
            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs text-rose-800 leading-relaxed">
              <div className="font-semibold">
                {selected.full_name ?? 'Driver ini'} diblokir karena: {reasonLabel(selected.deactivation_reason)}
              </div>
              {selected.deactivation_note && <div className="mt-1">{selected.deactivation_note}</div>}
              <div className="mt-2">
                Setelah dibuka, akun penumpangnya bisa dipakai lagi dan driver kembali ke &quot;Menunggu verifikasi&quot;. Dia tidak langsung aktif;
                dokumennya harus diperiksa dan disetujui ulang. Tindakan ini dicatat di log aktivitas.
              </div>
            </div>
            <div className="mt-4 text-xs font-semibold text-slate-700">Alasan membuka blokir (minimal 10 huruf)</div>
            <textarea
              value={banNote}
              onChange={(e) => setBanNote(e.target.value)}
              maxLength={300}
              rows={3}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
            />
            <div className="mt-3 text-xs font-semibold text-slate-700">
              Ketik <span className="font-mono text-rose-700">BUKA BLOKIR</span> untuk melanjutkan
            </div>
            <input
              value={banConfirm}
              onChange={(e) => setBanConfirm(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                disabled={busy}
                onClick={() => setBanOpen(false)}
                className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                disabled={busy || banConfirm.trim().toUpperCase() !== 'BUKA BLOKIR' || banNote.trim().length < 10}
                onClick={submitUnban}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-40"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Buka blokir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}