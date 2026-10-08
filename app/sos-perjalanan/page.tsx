'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Siren,
  Loader2,
  AlertTriangle,
  Phone,
  MapPin,
  Navigation,
  ExternalLink,
  CheckCircle2,
  RotateCcw,
  Volume2,
  VolumeX,
  Bike,
  Car,
} from 'lucide-react';

interface SosRow {
  id: string;
  order_id: string;
  role: 'passenger' | 'driver';
  status: 'open' | 'handled';
  created_at: string;
  handled_at: string | null;
  lat: number | null;
  lng: number | null;
  sender_name: string | null;
  sender_phone: string | null;
  other_name: string | null;
  other_phone: string | null;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  service_type: string | null;
  order_status: string | null;
  pickup_address: string | null;
  destination_address: string | null;
}

interface Summary {
  open: number;
  handled_7d: number;
  total_30d: number;
  oldest_open_minutes: number | null;
}

const POLL_MS = 10000;

function ago(iso: string, nowMs: number) {
  const m = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.22);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // browser menolak suara; abaikan
  }
}

export default function SosPerjalananPage() {
  const [rows, setRows] = useState<SosRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<'open' | 'handled'>('open');
  const [alarmOn, setAlarmOn] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const knownOpen = useRef<Set<string> | null>(null);
  const alarmRef = useRef(false);

  useEffect(() => {
    alarmRef.current = alarmOn;
  }, [alarmOn]);

  useEffect(() => {
    const t = setInterval(() => setReloadKey((k) => k + 1), POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    async function run() {
      const [listRes, sumRes] = await Promise.all([
        supabase.rpc('admin_sos_list', { p_status: null, p_days: 30 }),
        supabase.rpc('admin_sos_summary'),
      ]);
      if (!alive) return;
      if (listRes.error) {
        setError(`Gagal memuat SOS: ${listRes.error.message}`);
      } else {
        setError(null);
        const list = (listRes.data as SosRow[]) ?? [];
        const openIds = list.filter((r) => r.status === 'open').map((r) => r.id);
        if (knownOpen.current && alarmRef.current && openIds.some((id) => !knownOpen.current?.has(id))) {
          beep();
        }
        knownOpen.current = new Set(openIds);
        setRows(list);
      }
      if (!sumRes.error && sumRes.data) setSummary(sumRes.data as Summary);
      setNowMs(Date.now());
      setUpdatedAt(new Date());
      setLoading(false);
    }
    run();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const openCount = rows.filter((r) => r.status === 'open').length;

  useEffect(() => {
    const original = document.title;
    document.title = openCount > 0 ? `(${openCount}) SOS terbuka` : original;
    return () => {
      document.title = original;
    };
  }, [openCount]);

  async function setStatus(r: SosRow, status: 'open' | 'handled') {
    setBusyId(r.id);
    const { data, error: err } = await supabase.rpc('admin_sos_set_status', { p_id: r.id, p_status: status });
    setBusyId(null);
    const res = data as { success?: boolean; message?: string } | null;
    if (err || !res?.success) {
      setError(`Gagal: ${err?.message ?? res?.message ?? 'tidak diketahui'}`);
      return;
    }
    setReloadKey((k) => k + 1);
  }

  const shown = rows.filter((r) => r.status === tab);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">SOS Perjalanan</h2>
          <p className="text-sm text-slate-500 mt-1">
            Tombol darurat yang ditekan penumpang atau driver saat trip berjalan. Halaman ini menyegarkan diri tiap 10 detik.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Langsung{updatedAt ? ` - ${updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
          </span>
          <button
            onClick={() => {
              const next = !alarmOn;
              setAlarmOn(next);
              if (next) beep();
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold transition ${
              alarmOn ? 'bg-gradient-to-b from-[#4a98ad] to-[#2f7088] border-transparent text-white shadow-md' : 'bg-white/80 border-white shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] text-slate-700 hover:bg-white'
            }`}
          >
            {alarmOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            Alarm {alarmOn ? 'aktif' : 'mati'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {error}
            <div className="text-xs text-rose-600/80 mt-0.5">Pastikan SQL &quot;Part AS&quot; sudah dijalankan di Supabase SQL Editor.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Terbuka sekarang', value: summary?.open, tint: (summary?.open ?? 0) > 0 ? 'from-[#fde4e4] to-[#f8c9c9]' : 'from-[#e3ecfb] to-[#cddcf5]', tone: (summary?.open ?? 0) > 0 ? 'text-rose-700' : 'text-[#27468c]' },
          {
            label: 'Paling lama menunggu',
            value: summary?.oldest_open_minutes != null ? `${summary.oldest_open_minutes} mnt` : '-',
            tint: 'from-[#fdeedb] to-[#f7d9b4]',
            tone: 'text-[#8a5314]',
          },
          { label: 'Ditangani 7 hari', value: summary?.handled_7d, tint: 'from-[#dcf3ea] to-[#bfe5d6]', tone: 'text-[#1d6a50]' },
          { label: 'Total 30 hari', value: summary?.total_30d, tint: 'from-[#eceff4] to-[#d8dee8]', tone: 'text-[#475569]' },
        ].map((c) => (
          <div key={c.label} className={`rounded-3xl bg-gradient-to-br ${c.tint} p-4 shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{c.label}</div>
            <div className={`mt-1.5 text-3xl font-extrabold tabular-nums ${c.tone}`}>{c.value ?? '-'}</div>
          </div>
        ))}
      </div>

      <div className="inline-flex gap-1 p-1 rounded-full bg-white/70 border border-white shadow-[0_6px_16px_-10px_rgba(60,80,130,0.35)]">
        {([
          ['open', `Terbuka (${openCount})`],
          ['handled', 'Sudah ditangani'],
        ] as ['open' | 'handled', string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-5 py-2 text-[13px] font-semibold rounded-full transition ${
              tab === k ? 'bg-gradient-to-b from-[#4a98ad] to-[#2f7088] text-white shadow' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-white/80 backdrop-blur border border-white shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]">
          <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {tab === 'open' ? 'Tidak ada SOS yang terbuka' : 'Belum ada SOS yang ditangani'}
          </p>
          <p className="text-xs text-slate-400 mt-1">Biarkan halaman ini terbuka agar kamu langsung tahu kalau ada yang menekan SOS.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((r) => {
            const isOpen = r.status === 'open';
            const mapUrl = r.lat != null && r.lng != null ? `https://www.google.com/maps?q=${r.lat},${r.lng}` : null;
            return (
              <article
                key={r.id}
                className={`rounded-3xl border bg-white/80 backdrop-blur overflow-hidden ${isOpen ? 'border-rose-300 ring-2 ring-rose-500/10 shadow-[0_12px_30px_-14px_rgba(225,29,72,0.35)]' : 'border-white shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]'}`}
              >
                <div className={`px-5 py-3 flex items-center justify-between gap-3 ${isOpen ? 'bg-rose-50 border-b border-rose-100' : 'bg-slate-50 border-b border-slate-100'}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Siren className={`w-4 h-4 shrink-0 ${isOpen ? 'text-rose-600' : 'text-slate-400'}`} />
                    <span className={`text-sm font-bold truncate ${isOpen ? 'text-rose-700' : 'text-slate-700'}`}>
                      SOS dari {r.role === 'driver' ? 'driver' : 'penumpang'}: {r.sender_name ?? 'Tanpa nama'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">
                    {ago(r.created_at, nowMs)} - {fmtDateTime(r.created_at)}
                  </span>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {r.service_type === 'car' ? <Car className="w-3.5 h-3.5" /> : <Bike className="w-3.5 h-3.5" />}
                      {r.service_type === 'car' ? 'Pim Car' : 'Pim Ride'}
                      {r.vehicle_plate && ` - ${r.vehicle_plate}`}
                      {r.vehicle_model && ` (${r.vehicle_model})`}
                    </div>
                    <div className="flex gap-2.5">
                      <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      <div className="text-slate-800">{r.pickup_address ?? '-'}</div>
                    </div>
                    <div className="flex gap-2.5">
                      <Navigation className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                      <div className="text-slate-800">{r.destination_address ?? '-'}</div>
                    </div>
                    {mapUrl ? (
                      <a
                        href={mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        Lihat posisi saat SOS ditekan di peta <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <div className="text-xs text-slate-400">Posisi tidak terkirim (GPS pengirim mati atau belum diizinkan).</div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {[
                      { title: r.role === 'driver' ? 'Driver (pengirim SOS)' : 'Penumpang (pengirim SOS)', name: r.sender_name, phone: r.sender_phone },
                      { title: r.role === 'driver' ? 'Penumpang' : 'Driver', name: r.other_name, phone: r.other_phone },
                    ].map((p) => (
                      <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-400">{p.title}</div>
                          <div className="text-sm font-semibold text-slate-900 truncate">{p.name ?? '-'}</div>
                        </div>
                        {p.phone && (
                          <a
                            href={`tel:${p.phone.startsWith('0') || p.phone.startsWith('+') ? p.phone : '0' + p.phone}`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-b from-[#4a98ad] to-[#2f7088] hover:opacity-90 text-white text-xs font-semibold shrink-0"
                          >
                            <Phone className="w-3.5 h-3.5" /> {p.phone}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">
                    Status trip: {r.order_status ?? '-'}
                    {!isOpen && r.handled_at ? ` - ditangani ${fmtDateTime(r.handled_at)}` : ''}
                  </span>
                  {isOpen ? (
                    <button
                      disabled={busyId === r.id}
                      onClick={() => setStatus(r, 'handled')}
                      className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-b from-[#34b27f] to-[#1f8a60] hover:opacity-90 text-white shadow-md text-xs font-semibold disabled:opacity-60"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Tandai sudah ditangani
                    </button>
                  ) : (
                    <button
                      disabled={busyId === r.id}
                      onClick={() => setStatus(r, 'open')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold disabled:opacity-60"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Buka kembali
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}