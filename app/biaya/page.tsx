'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, RefreshCw, AlertTriangle, X } from 'lucide-react';

interface Overview {
  routes_enabled: string;
  routes_daily_limit: number;
  routes_today: number;
  routes_month: number;
  ai_today: number;
  ai_month: number;
  routes_daily: { day: string; used: number }[];
  ai_daily: { day: string; calls: number; users: number }[];
  ai_top_users: { user_id: string; name: string; calls: number }[];
  cost_route_usd_per_1k: number;
  cost_route_free_month: number;
  cost_ai_usd_per_call: number;
  cost_usd_idr: number;
}

const CARD = 'bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]';
const D3 = 'shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]';
const GRAD = 'bg-gradient-to-b from-[#4a98ad] to-[#2f7088]';

function rp(n: number) { return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n)); }
function nf(n: number) { return new Intl.NumberFormat('id-ID').format(Math.round(n)); }
function errText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Terjadi kesalahan.';
}

function Bars({ data, limit, color }: { data: { label: string; value: number }[]; limit?: number; color: string }) {
  const W = 640;
  const H = 150;
  const pad = { l: 34, r: 8, t: 8, b: 22 };
  const max = Math.max(4, ...data.map((d) => d.value), limit ?? 0);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / Math.max(1, data.length);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const step = Math.max(1, Math.ceil(data.length / 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={pad.l - 6} y={y(max * t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{nf(max * t)}</text>
        </g>
      ))}
      {data.map((d, i) => (
        <g key={i}>
          <rect x={pad.l + i * bw + bw * 0.15} y={y(d.value)} width={bw * 0.7} height={Math.max(0, pad.t + ih - y(d.value))} rx="3" fill={color}>
            <title>{`${d.label}: ${nf(d.value)}`}</title>
          </rect>
          {i % step === 0 && <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{d.label}</text>}
        </g>
      ))}
      {limit !== undefined && limit > 0 && (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={y(limit)} y2={y(limit)} stroke="#e11d48" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={W - pad.r} y={y(limit) - 4} textAnchor="end" fontSize="10" fill="#e11d48">batas {nf(limit)}</text>
        </g>
      )}
    </svg>
  );
}

export default function BiayaPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [limitDraft, setLimitDraft] = useState('');
  const [cost, setCost] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { data: res, error: e } = await supabase.rpc('admin_costs_overview', { p_days: days });
      if (!alive) return;
      if (e) {
        setError(e.message + ' Pastikan SQL Part AY sudah dijalankan di Supabase SQL Editor.');
      } else {
        const o = res as Overview;
        setData(o);
        setLimitDraft(String(o.routes_daily_limit));
        setCost({
          cost_route_usd_per_1k: String(o.cost_route_usd_per_1k),
          cost_route_free_month: String(o.cost_route_free_month),
          cost_ai_usd_per_call: String(o.cost_ai_usd_per_call),
          cost_usd_idr: String(o.cost_usd_idr),
        });
        const parts = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).split('-').map(Number);
        setDayOfMonth(parts[2]);
        setDaysInMonth(new Date(parts[0], parts[1], 0).getDate());
        setError('');
      }
      setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [days, reloadKey]);

  const reload = () => { setLoading(true); setReloadKey((k) => k + 1); };

  const calc = useMemo(() => {
    if (!data) return null;
    const idr = data.cost_usd_idr;
    const routeCost = (calls: number) => (Math.max(0, calls - data.cost_route_free_month) / 1000) * data.cost_route_usd_per_1k * idr;
    const aiCost = (calls: number) => calls * data.cost_ai_usd_per_call * idr;
    const factor = daysInMonth / Math.max(1, dayOfMonth);
    return {
      routeNow: routeCost(data.routes_month),
      aiNow: aiCost(data.ai_month),
      routeProj: routeCost(data.routes_month * factor),
      aiProj: aiCost(data.ai_month * factor),
      freeLeft: Math.max(0, data.cost_route_free_month - data.routes_month),
    };
  }, [data, dayOfMonth, daysInMonth]);

  const saveSettings = async (payload: Record<string, string>, fn: 'admin_settings_save' | 'admin_costs_save', confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError('');
    setOkMsg('');
    const { error: e } = await supabase.rpc(fn, { p_changes: payload });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    setOkMsg('Tersimpan.');
    reload();
  };

  const routesOn = data?.routes_enabled !== 'false';
  const limitPct = data && data.routes_daily_limit > 0 ? Math.min(100, (data.routes_today / data.routes_daily_limit) * 100) : 0;
  const shortDay = (iso: string) => iso.slice(8, 10);

  const costDirty = data
    ? ['cost_route_usd_per_1k', 'cost_route_free_month', 'cost_ai_usd_per_call', 'cost_usd_idr'].some((k) => Number(cost[k]) !== Number((data as unknown as Record<string, number>)[k]))
    : false;

  const costFields: { key: string; label: string; hint: string }[] = [
    { key: 'cost_route_usd_per_1k', label: 'Biaya rute per 1.000 permintaan (dolar)', hint: 'Setelah kuota gratis habis' },
    { key: 'cost_route_free_month', label: 'Kuota rute gratis per bulan', hint: 'Dari paket Google Maps Platform' },
    { key: 'cost_ai_usd_per_call', label: 'Biaya AI per pertanyaan (dolar)', hint: 'Perkiraan kasar, cocokkan dengan tagihan penyedia AI' },
    { key: 'cost_usd_idr', label: 'Kurs dolar ke rupiah', hint: 'Perbarui kalau kurs berubah jauh' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Biaya Peta dan AI</h2>
          <p className="text-sm text-slate-500 mt-1">Pantau pemakaian layanan berbayar dan matikan seketika kalau mulai membengkak.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => { setLoading(true); setDays(Number(e.target.value)); }}
            className="text-xs font-semibold rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700"
          >
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
          </select>
          <button onClick={reload} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] text-xs font-semibold text-slate-700 hover:bg-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Muat ulang
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900 leading-relaxed">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Angka rupiah di halaman ini adalah <b>perkiraan</b> dari jumlah pemakaian dikali asumsi harga. Tagihan resmi tetap dicek di Google Cloud dan di penyedia AI.</span>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-2xl px-4 py-3">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
      )}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl px-4 py-3">{okMsg}</div>}

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Memuat data</div>
      ) : data && calc && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={`rounded-[22px] p-5 bg-gradient-to-br from-[#d9e8f4] to-[#b6d0e4] ${D3}`}>
              <div className="text-xs font-semibold text-slate-600">Rute hari ini</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-slate-800">{nf(data.routes_today)}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">dari batas {nf(data.routes_daily_limit)} per hari</div>
            </div>
            <div className={`rounded-[22px] p-5 bg-gradient-to-br from-[#e8edf4] to-[#cfd9e6] ${D3}`}>
              <div className="text-xs font-semibold text-slate-600">Rute bulan ini</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-slate-800">{nf(data.routes_month)}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">kuota gratis tersisa {nf(calc.freeLeft)}</div>
            </div>
            <div className={`rounded-[22px] p-5 bg-gradient-to-br from-[#c6ebe1] to-[#98d4c9] ${D3}`}>
              <div className="text-xs font-semibold text-slate-600">Pertanyaan AI hari ini</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-slate-800">{nf(data.ai_today)}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">bulan ini {nf(data.ai_month)}</div>
            </div>
            <div className={`rounded-[22px] p-5 bg-gradient-to-br from-[#f9e6c6] to-[#efcd96] ${D3}`}>
              <div className="text-xs font-semibold text-slate-600">Perkiraan biaya bulan ini</div>
              <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-slate-800">{rp(calc.routeNow + calc.aiNow)}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">proyeksi akhir bulan {rp(calc.routeProj + calc.aiProj)}</div>
            </div>
          </div>

          <section className={`${CARD} p-5`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Rute jalan asli (Google Maps)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Status sekarang: <b className={routesOn ? 'text-emerald-700' : 'text-rose-700'}>{routesOn ? 'Aktif' : 'Mati, aplikasi memakai garis lurus'}</b>
                </p>
              </div>
              <button
                disabled={busy}
                onClick={() => saveSettings(
                  { routes_enabled: routesOn ? 'false' : 'true' },
                  'admin_settings_save',
                  routesOn
                    ? 'Matikan rute jalan asli sekarang? Aplikasi akan memakai garis lurus sampai kamu menyalakannya lagi.'
                    : 'Nyalakan lagi rute jalan asli? Permintaan rute akan kembali dihitung biayanya.'
                )}
                className={`px-5 py-2.5 rounded-full text-xs font-semibold shadow-md disabled:opacity-60 ${routesOn ? 'bg-rose-600 hover:bg-rose-700 text-white' : `${GRAD} text-white hover:opacity-90`}`}
              >
                {routesOn ? 'Matikan rute (darurat)' : 'Nyalakan rute'}
              </button>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>Pemakaian hari ini</span>
                <span>{nf(data.routes_today)} dari {nf(data.routes_daily_limit)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-2 rounded-full ${limitPct >= 90 ? 'bg-rose-500' : limitPct >= 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-[#4a98ad] to-[#2f7088]'}`} style={{ width: `${Math.max(2, limitPct)}%` }} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="text-xs font-semibold text-slate-700">Batas permintaan per hari
                <input
                  value={limitDraft}
                  onChange={(e) => setLimitDraft(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  className="mt-1 block w-40 text-sm rounded-full border border-slate-200 bg-white px-4 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </label>
              <button
                disabled={busy || limitDraft === '' || Number(limitDraft) === data.routes_daily_limit}
                onClick={() => saveSettings({ routes_daily_limit: limitDraft }, 'admin_settings_save')}
                className={`px-5 py-2 rounded-full ${GRAD} text-white text-xs font-semibold shadow-md hover:opacity-90 disabled:opacity-40`}
              >
                Simpan batas
              </button>
              <span className="text-[11px] text-slate-400">Kalau batas tercapai, permintaan rute berhenti sampai besok.</span>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className={`${CARD} p-5`}>
              <h3 className="text-sm font-bold text-slate-800">Permintaan rute per hari</h3>
              <p className="text-xs text-slate-500 mb-2">{days} hari terakhir. Garis merah putus-putus adalah batas harian.</p>
              <Bars data={data.routes_daily.map((d) => ({ label: shortDay(d.day), value: d.used }))} limit={data.routes_daily_limit} color="#4a98ad" />
            </section>
            <section className={`${CARD} p-5`}>
              <h3 className="text-sm font-bold text-slate-800">Pertanyaan ke asisten AI per hari</h3>
              <p className="text-xs text-slate-500 mb-2">{days} hari terakhir, dihitung dari semua pengguna.</p>
              <Bars data={data.ai_daily.map((d) => ({ label: shortDay(d.day), value: d.calls }))} color="#62aea8" />
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className={`${CARD} p-5`}>
              <h3 className="text-sm font-bold text-slate-800">Rincian perkiraan biaya bulan ini</h3>
              <dl className="mt-3 text-sm divide-y divide-slate-100">
                <div className="py-2 flex justify-between"><dt className="text-slate-500">Rute jalan (sekarang)</dt><dd className="font-semibold tabular-nums">{rp(calc.routeNow)}</dd></div>
                <div className="py-2 flex justify-between"><dt className="text-slate-500">Asisten AI (sekarang)</dt><dd className="font-semibold tabular-nums">{rp(calc.aiNow)}</dd></div>
                <div className="py-2 flex justify-between"><dt className="text-slate-500">Rute jalan (proyeksi akhir bulan)</dt><dd className="font-semibold tabular-nums">{rp(calc.routeProj)}</dd></div>
                <div className="py-2 flex justify-between"><dt className="text-slate-500">Asisten AI (proyeksi akhir bulan)</dt><dd className="font-semibold tabular-nums">{rp(calc.aiProj)}</dd></div>
              </dl>
              <p className="text-[11px] text-slate-400 mt-2">Proyeksi memakai rata-rata harian sampai hari ini. Biaya ini bisa dicatat di halaman Keuangan sebagai pengeluaran Google Maps dan AI.</p>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-4">Pengguna AI terbanyak bulan ini</h4>
              {data.ai_top_users.length === 0 ? (
                <p className="text-sm text-slate-500 mt-1">Belum ada pemakaian.</p>
              ) : (
                <ul className="mt-1 divide-y divide-slate-100 text-sm">
                  {data.ai_top_users.map((u) => (
                    <li key={u.user_id} className="py-1.5 flex justify-between"><span className="text-slate-700">{u.name}</span><span className="tabular-nums text-slate-500">{nf(u.calls)} pertanyaan</span></li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${CARD} p-5`}>
              <h3 className="text-sm font-bold text-slate-800">Asumsi harga</h3>
              <p className="text-xs text-slate-500 mt-0.5">Dipakai untuk menghitung perkiraan. Ubah kalau harga resmi berubah.</p>
              <div className="mt-3 space-y-3">
                {costFields.map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-slate-700" htmlFor={f.key}>{f.label}</label>
                    <input
                      id={f.key}
                      value={cost[f.key] ?? ''}
                      onChange={(e) => setCost((c) => ({ ...c, [f.key]: e.target.value.replace(/[^0-9.]/g, '') }))}
                      inputMode="decimal"
                      className="mt-1 w-full text-sm rounded-full border border-slate-200 bg-white px-4 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-0.5">{f.hint}</p>
                  </div>
                ))}
              </div>
              <button
                disabled={busy || !costDirty}
                onClick={() => saveSettings(cost, 'admin_costs_save')}
                className={`mt-4 px-5 py-2 rounded-full ${GRAD} text-white text-xs font-semibold shadow-md hover:opacity-90 disabled:opacity-40`}
              >
                Simpan asumsi
              </button>
            </section>
          </div>

          <section className={`${CARD} p-5`}>
            <h3 className="text-sm font-bold text-slate-800">Panduan singkat</h3>
            <div className="mt-2 divide-y divide-slate-100 text-sm">
              <details open className="py-2.5">
                <summary className="cursor-pointer font-semibold text-slate-800">Kapan harus mematikan rute?</summary>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-600">Matikan kalau pemakaian hari ini melonjak jauh dari biasanya, atau kalau kamu curiga ada yang menyalahgunakan. Setelah dimatikan, aplikasi tetap bisa dipakai: peta menampilkan garis lurus antara jemput dan tujuan, dan pesanan tetap berjalan. Nyalakan lagi kapan saja dengan tombol yang sama.</p>
              </details>
              <details className="py-2.5">
                <summary className="cursor-pointer font-semibold text-slate-800">Cara kerja batas harian</summary>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-600">Rute diminta satu kali per pesanan lalu disimpan, jadi pemakaian kira-kira sama dengan jumlah pesanan yang jalan hari itu. Batas harian adalah pagar otomatis: saat tercapai, permintaan rute baru ditolak sampai pukul 00.00 WIB. Atur batas sedikit di atas pemakaian normalmu.</p>
              </details>
              <details className="py-2.5">
                <summary className="cursor-pointer font-semibold text-slate-800">Bagaimana angka rupiah dihitung?</summary>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-600">Rute: (permintaan bulan ini dikurangi kuota gratis) dibagi 1.000, dikali harga per 1.000, dikali kurs. AI: jumlah pertanyaan dikali harga per pertanyaan dikali kurs. Karena harga di sini hanya asumsi, anggap hasilnya sebagai gambaran besar, bukan angka tagihan.</p>
              </details>
            </div>
          </section>
        </>
      )}
    </div>
  );
}