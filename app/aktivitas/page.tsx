'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, RefreshCw, Search, Download, AlertTriangle } from 'lucide-react';

interface Row {
  id: number;
  at: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  admin_id: string | null;
  admin_name: string | null;
  target_name: string | null;
}
interface AdminRef { id: string; name: string }

type Cat = 'all' | 'driver' | 'keuangan' | 'pengaturan' | 'sos' | 'lain';

const CARD = 'bg-white/90 border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.3)]';
const D3 = 'shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]';

const KEY_LABEL: Record<string, string> = {
  fare_ride_base1: 'Tarif Pim Ride tahap 1', fare_ride_base2: 'Tarif Pim Ride tahap 2', fare_ride_per_km: 'Pim Ride tambahan per km',
  fare_car_base1: 'Tarif Pim Car tahap 1', fare_car_base2: 'Tarif Pim Car tahap 2', fare_car_per_km: 'Pim Car tambahan per km',
  fare_tier1_km: 'Batas jarak tahap 1', fare_tier2_km: 'Batas jarak tahap 2', car_large_multiplier: 'Pengali kelas besar',
  bargain_min_pct: 'Batas bawah tawar', bargain_max_pct: 'Batas atas tawar', commission_pct: 'Komisi',
  commission_min_km: 'Batas jarak komisi', platform_fee: 'Biaya platform', tolongin_sub_price: 'Harga langganan Tolongin',
  tolongin_badge_price: 'Harga lencana Terbaik', routes_enabled: 'Rute jalan asli', routes_daily_limit: 'Batas rute per hari',
  cost_route_usd_per_1k: 'Asumsi biaya rute per 1.000', cost_route_free_month: 'Kuota rute gratis', cost_ai_usd_per_call: 'Asumsi biaya AI per pertanyaan',
  cost_usd_idr: 'Kurs dolar',
};
const DOC_LABEL: Record<string, string> = { ktp: 'KTP', sim: 'SIM', stnk: 'STNK', vehicle_photo: 'Foto kendaraan' };

function rp(n: number) { return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n)); }
function str(v: unknown) { return v === null || v === undefined || v === '' ? '-' : String(v); }
function fmtAt(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function catOf(a: string): Cat {
  if (a.startsWith('driver_')) return 'driver';
  if (a.startsWith('finance_')) return 'keuangan';
  if (a.startsWith('settings_')) return 'pengaturan';
  if (a.startsWith('sos_')) return 'sos';
  return 'lain';
}
function settingVal(key: string, v: unknown) {
  const s = str(v);
  if (key === 'routes_enabled') return s === 'true' ? 'Aktif' : s === 'false' ? 'Mati' : s;
  if (/^fare_.*(base|per_km)|platform_fee|tolongin_/.test(key)) return rp(Number(s));
  if (key.endsWith('_km')) return s + ' km';
  if (key.endsWith('_pct')) return s + '%';
  return s;
}

function describe(r: Row): { label: string; tone: string; who: string; info: string } {
  const d = r.detail ?? {};
  const name = r.target_name ?? '-';
  const a = r.action;
  const green = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  const red = 'bg-rose-50 text-rose-700 border-rose-200';
  const amber = 'bg-amber-50 text-amber-700 border-amber-200';
  const blue = 'bg-blue-50 text-blue-700 border-blue-200';
  const slate = 'bg-slate-100 text-slate-600 border-slate-200';
  if (a === 'driver_doc_approved') return { label: 'Dokumen disetujui', tone: green, who: name, info: DOC_LABEL[String(d.document)] ?? str(d.document) };
  if (a === 'driver_doc_rejected') return { label: 'Dokumen ditolak', tone: red, who: name, info: `${DOC_LABEL[String(d.document)] ?? str(d.document)}. Alasan: ${str(d.reason)}` };
  if (a === 'driver_status_approved') return { label: 'Driver diaktifkan', tone: green, who: name, info: '' };
  if (a === 'driver_status_rejected') return { label: 'Driver ditolak atau dinonaktifkan', tone: red, who: name, info: '' };
  if (a === 'driver_status_pending') return { label: 'Driver dikembalikan ke menunggu', tone: amber, who: name, info: '' };
  if (a === 'driver_car_class') return { label: 'Kelas mobil diubah', tone: blue, who: name, info: `${d.from === 'large' ? 'Besar' : 'Kecil'} menjadi ${d.to === 'large' ? 'Besar' : 'Kecil'}` };
  if (a === 'driver_topup') {
    const amt = Number(d.amount ?? 0);
    return { label: amt >= 0 ? 'Saldo driver ditambah' : 'Saldo driver dikurangi', tone: amt >= 0 ? green : red, who: name,
      info: `${amt >= 0 ? '+' : '-'}${rp(Math.abs(amt))}. Catatan: ${str(d.note)}. Saldo setelahnya ${rp(Number(d.balance_after ?? 0))}` };
  }
  if (a === 'finance_add') return { label: d.kind === 'income' ? 'Pendapatan dicatat' : 'Pengeluaran dicatat', tone: d.kind === 'income' ? green : amber, who: str(r.target_id), info: rp(Number(d.amount ?? 0)) };
  if (a === 'finance_delete') return { label: 'Catatan keuangan dihapus', tone: red, who: str(d.category ?? r.target_id), info: d.amount ? rp(Number(d.amount)) : '' };
  if (a === 'finance_recurring_save') return { label: 'Aturan rutin disimpan', tone: blue, who: str(r.target_id), info: `${rp(Number(d.amount ?? 0))} tiap tanggal ${str(d.day)}` };
  if (a === 'finance_recurring_delete') return { label: 'Aturan rutin dihapus', tone: red, who: str(r.target_id), info: '' };
  if (a === 'settings_save') {
    const k = str(r.target_id);
    return { label: 'Pengaturan diubah', tone: blue, who: KEY_LABEL[k] ?? k, info: `${settingVal(k, d.old)} menjadi ${settingVal(k, d.new)}` };
  }
  if (a.startsWith('sos_')) return { label: `SOS ditandai ${a.replace('sos_', '')}`, tone: red, who: str(r.target_id).slice(0, 8), info: '' };
  if (a === 'report_status') return { label: 'Status laporan pengguna diubah', tone: blue, who: name !== '-' ? name : str(r.target_id).slice(0, 8), info: str(d.p_status) };
  if (a === 'tolongin_badge') return { label: 'Lencana Terbaik diperpanjang', tone: green, who: name !== '-' ? name : str(r.target_id).slice(0, 8), info: `${str(d.p_months)} bulan` };
  if (a === 'tolongin_langganan') return { label: 'Langganan Tolongin diperpanjang', tone: green, who: name !== '-' ? name : str(r.target_id).slice(0, 8), info: `${str(d.p_months)} bulan` };
  if (a === 'tolongin_job') return { label: 'Pekerjaan Tolongin diselesaikan admin', tone: amber, who: str(r.target_id).slice(0, 8), info: str(d.p_outcome) };
  if (a === 'user_block') return { label: 'Pengguna diblokir', tone: red, who: name !== '-' ? name : str(r.target_id).slice(0, 8), info: `Alasan: ${str(d.reason)}` };
  if (a === 'user_unblock') return { label: 'Blokir pengguna dibuka', tone: green, who: name !== '-' ? name : str(r.target_id).slice(0, 8), info: '' };
  if (a === 'staff_add') return { label: 'Staf ditambahkan', tone: blue, who: str(d.email), info: `Peran ${str(d.role)}` };
  if (a === 'staff_role') return { label: 'Peran staf diubah', tone: blue, who: name, info: `${str(d.old)} menjadi ${str(d.new)}` };
  if (a === 'staff_remove') return { label: 'Akses staf dicabut', tone: red, who: name, info: '' };
  if (a === 'staff_name') return { label: 'Nama staf diubah', tone: slate, who: name, info: '' };
  if (a === 'test_account_on') return { label: 'Ditandai akun uji coba', tone: slate, who: name, info: '' };
  if (a === 'test_account_off') return { label: 'Tanda akun uji coba dicabut', tone: slate, who: name, info: '' };
  return { label: a, tone: slate, who: name !== '-' ? name : str(r.target_id), info: r.detail ? JSON.stringify(r.detail) : '' };
}

export default function AktivitasPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [admins, setAdmins] = useState<AdminRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [days, setDays] = useState(30);
  const [cat, setCat] = useState<Cat>('all');
  const [adminId, setAdminId] = useState('all');
  const [query, setQuery] = useState('');
  const [todayKey, setTodayKey] = useState('');

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { data, error: e } = await supabase.rpc('admin_activity_list', { p_days: days, p_limit: 600 });
      if (!alive) return;
      if (e) {
        setError(e.message + ' Pastikan SQL Part AY sudah dijalankan di Supabase SQL Editor.');
      } else {
        const res = data as { rows: Row[]; admins: AdminRef[] };
        setRows(res.rows ?? []);
        setAdmins(res.admins ?? []);
        setTodayKey(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }));
        setError('');
      }
      setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [days, reloadKey]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== 'all' && catOf(r.action) !== cat) return false;
      if (adminId !== 'all' && r.admin_id !== adminId) return false;
      if (!q) return true;
      const d = describe(r);
      return `${d.label} ${d.who} ${d.info} ${r.admin_name ?? ''}`.toLowerCase().includes(q);
    });
  }, [rows, cat, adminId, query]);

  const todayCount = useMemo(
    () => rows.filter((r) => new Date(r.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === todayKey).length,
    [rows, todayKey]
  );
  const activeAdmins = useMemo(() => new Set(rows.map((r) => r.admin_id).filter(Boolean)).size, [rows]);

  const exportCsv = () => {
    const q = (v: string) => '"' + v.replace(/"/g, '""') + '"';
    const lines = [['Waktu', 'Admin', 'Aksi', 'Sasaran', 'Rincian'].map(q).join(',')];
    shown.forEach((r) => {
      const d = describe(r);
      lines.push([new Date(r.at).toLocaleString('id-ID'), r.admin_name ?? '-', d.label, d.who, d.info].map(q).join(','));
    });
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aktivitas-admin.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const cats: [Cat, string][] = [['all', 'Semua'], ['driver', 'Driver'], ['keuangan', 'Keuangan'], ['pengaturan', 'Pengaturan'], ['sos', 'SOS'], ['lain', 'Lainnya']];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Catatan Aktivitas Admin</h2>
          <p className="text-sm text-slate-500 mt-1">Siapa mengubah apa dan kapan. Dicatat otomatis setiap admin melakukan tindakan penting.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={days}
            onChange={(e) => { setLoading(true); setDays(Number(e.target.value)); }}
            className="text-xs font-semibold rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700"
          >
            <option value={7}>7 hari terakhir</option>
            <option value={30}>30 hari terakhir</option>
            <option value={90}>90 hari terakhir</option>
            <option value={365}>1 tahun terakhir</option>
          </select>
          <button onClick={exportCsv} disabled={shown.length === 0} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
          <button onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] text-xs font-semibold text-slate-700 hover:bg-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Muat ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Aktivitas dalam periode', value: rows.length, tint: 'from-[#d9e8f4] to-[#b6d0e4]' },
          { label: 'Aktivitas hari ini', value: todayCount, tint: 'from-[#c6ebe1] to-[#98d4c9]' },
          { label: 'Admin yang aktif', value: activeAdmins, tint: 'from-[#e8edf4] to-[#cfd9e6]' },
        ].map((c) => (
          <div key={c.label} className={`rounded-[22px] p-5 bg-gradient-to-br ${c.tint} ${D3}`}>
            <div className="text-xs font-semibold text-slate-600">{c.label}</div>
            <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-slate-800">{loading ? '-' : c.value}</div>
          </div>
        ))}
      </div>

      <section className={`${CARD} overflow-hidden`}>
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama driver, aksi, atau catatan"
                className="w-full pl-9 pr-4 py-2 text-sm rounded-full border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <select value={adminId} onChange={(e) => setAdminId(e.target.value)} className="text-sm rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700">
              <option value="all">Semua admin</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            {cats.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setCat(k)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full border ${cat === k ? 'bg-gradient-to-b from-[#4a98ad] to-[#2f7088] text-white border-transparent shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Memuat aktivitas...</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400">Belum ada aktivitas yang cocok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                  <th className="px-5 py-3 font-semibold">Waktu</th>
                  <th className="px-3 py-3 font-semibold">Admin</th>
                  <th className="px-3 py-3 font-semibold">Aksi</th>
                  <th className="px-3 py-3 font-semibold">Sasaran</th>
                  <th className="px-5 py-3 font-semibold">Rincian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => {
                  const d = describe(r);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtAt(r.at)}</td>
                      <td className="px-3 py-3 text-slate-800 font-medium whitespace-nowrap">{r.admin_name ?? 'Sistem'}</td>
                      <td className="px-3 py-3"><span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${d.tone}`}>{d.label}</span></td>
                      <td className="px-3 py-3 text-slate-700">{d.who}</td>
                      <td className="px-5 py-3 text-slate-600 max-w-[380px]">{d.info || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && rows.length >= 600 && (
          <div className="px-5 py-3 text-xs text-slate-400 border-t border-slate-100">Menampilkan 600 aktivitas terbaru. Persempit periode untuk melihat yang lebih lama.</div>
        )}
      </section>

      <p className="text-[11px] text-slate-400">
        Yang tercatat: tindakan pada driver (dokumen, status, kelas mobil, saldo), keuangan, pengaturan tarif dan biaya, SOS, dan penandaan akun uji coba. Tindakan lain (misalnya laporan pengguna dan Sobat Tolongin) belum dicatat di halaman ini.
      </p>
    </div>
  );
}