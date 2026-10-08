'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, Trash2, Download, Printer, RefreshCw, X } from 'lucide-react';

interface Summary {
  month: string;
  komisi: number;
  platform_fee: number;
  trips_completed: number;
  gmv: number;
  income_by_category: Record<string, number>;
  expense_by_category: Record<string, number>;
  income_total: number;
  expense_total: number;
  net: number;
  prev_income: number;
  prev_expense: number;
  prev_net: number;
  driver_balance_total: number;
  driver_balance_positive: number;
  driver_balance_negative: number;
  topup_month: number;
  correction_month: number;
}
interface MonthRow { month: string; income: number; expense: number; net: number }
interface Entry {
  id: string; entry_date: string; kind: 'income' | 'expense'; category: string;
  amount: number; note: string | null; source: 'manual' | 'auto' | 'recurring';
}
interface Rec {
  id: string; category: string; amount: number; note: string | null;
  day_of_month: number; active: boolean; start_date: string;
}

const INCOME_CATS: Record<string, string> = {
  langganan_tolongin: 'Langganan Sobat Tolongin',
  lencana_terbaik: 'Lencana Terbaik',
  iklan: 'Iklan berbayar',
  lainnya_masuk: 'Pendapatan lainnya',
};
const EXPENSE_CATS: Record<string, string> = {
  server: 'Server dan database',
  google_maps: 'Google Maps',
  ai_openai: 'AI dan OpenAI',
  notifikasi: 'Notifikasi dan SMS',
  pemasaran: 'Pemasaran dan promo',
  honor: 'Honor dan gaji',
  legal_admin: 'Legal dan administrasi',
  play_store: 'Play Store dan domain',
  lainnya_keluar: 'Pengeluaran lainnya',
};
const ALL_CATS = { ...INCOME_CATS, ...EXPENSE_CATS };
const TEMPLATES: { category: string; amount: number; note: string }[] = [
  { category: 'server', amount: 400000, note: 'Supabase' },
  { category: 'server', amount: 300000, note: 'Vercel' },
  { category: 'google_maps', amount: 200000, note: 'Google Maps (perkiraan)' },
  { category: 'ai_openai', amount: 150000, note: 'AI / OpenAI (perkiraan)' },
  { category: 'notifikasi', amount: 100000, note: 'Notifikasi / SMS' },
  { category: 'pemasaran', amount: 500000, note: 'Pemasaran bulanan' },
];

function rp(n: number | null | undefined) {
  const v = Math.round(Number(n ?? 0));
  return (v < 0 ? '-Rp ' : 'Rp ') + new Intl.NumberFormat('id-ID').format(Math.abs(v));
}
function catLabel(c: string) { return (ALL_CATS as Record<string, string>)[c] ?? c; }
function monthKey(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; }
function monthLabel(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}
function shortMonth(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { month: 'short' });
}
function delta(cur: number, prev: number) {
  if (!prev) return null;
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(0) + '% dari bulan lalu';
}
function errText(e: unknown) { return e instanceof Error ? e.message : 'Terjadi kesalahan.'; }

function Card({ title, value, sub, tone, hero }: { title: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'plain'; hero?: boolean }) {
  const bg = hero
    ? 'from-[#4a98ad] to-[#2f7088]'
    : tone === 'good' ? 'from-[#c6ebe1] to-[#98d4c9]' : tone === 'bad' ? 'from-[#f7d9de] to-[#ebb0ba]' : 'from-[#e8f0f7] to-[#cfdeea]';
  const color = hero ? 'text-white' : tone === 'good' ? 'text-emerald-900' : tone === 'bad' ? 'text-rose-900' : 'text-slate-800';
  return (
    <div className={`rounded-[22px] p-5 bg-gradient-to-br ${bg} shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${hero ? 'text-white/80' : 'text-slate-600'}`}>{title}</p>
      <p className={`text-xl font-extrabold mt-1 ${color}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${hero ? 'text-white/80' : 'text-slate-600'}`}>{sub}</p>}
    </div>
  );
}

export default function KeuanganPage() {
  const [month, setMonth] = useState<string>(() => monthKey(new Date()));
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [tab, setTab] = useState<'catatan' | 'rutin'>('catatan');

  const [showForm, setShowForm] = useState(false);
  const [fKind, setFKind] = useState<'income' | 'expense'>('expense');
  const [fCat, setFCat] = useState('server');
  const [fAmount, setFAmount] = useState('');
  const [fDate, setFDate] = useState('');
  const [fNote, setFNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [rCat, setRCat] = useState('server');
  const [rAmount, setRAmount] = useState('');
  const [rDay, setRDay] = useState('1');
  const [rNote, setRNote] = useState('');

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const { error: syncErr } = await supabase.rpc('admin_finance_sync');
        if (syncErr) throw syncErr;
        const [s, m, e, r] = await Promise.all([
          supabase.rpc('admin_finance_summary', { p_month: month }),
          supabase.rpc('admin_finance_months', { p_n: 6 }),
          supabase.rpc('admin_finance_entries', { p_month: month }),
          supabase.rpc('admin_finance_recurring_list'),
        ]);
        const bad = s.error || m.error || e.error || r.error;
        if (bad) throw bad;
        if (!alive) return;
        setSummary(s.data as Summary);
        setMonths((m.data ?? []) as MonthRow[]);
        setEntries((e.data ?? []) as Entry[]);
        setRecs((r.data ?? []) as Rec[]);
        setError('');
      } catch (err) {
        if (alive) setError(errText(err));
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => { alive = false; };
  }, [month, reloadKey]);

  const reload = () => { setLoading(true); setReloadKey(k => k + 1); };
  const changeMonth = (delta: number) => {
    const d = new Date(month + 'T00:00:00');
    d.setMonth(d.getMonth() + delta);
    setLoading(true);
    setMonth(monthKey(d));
  };
  const isCurrentMonth = month === monthKey(new Date());

  const openForm = (kind: 'income' | 'expense') => {
    setFKind(kind);
    setFCat(kind === 'income' ? 'iklan' : 'server');
    setFAmount(''); setFNote(''); setFDate('');
    setShowForm(true);
  };

  const submitEntry = async () => {
    const amount = parseInt(fAmount.replace(/\D/g, ''), 10);
    if (!amount) { setError('Isi nominal dulu.'); return; }
    setSaving(true);
    const { data, error: e } = await supabase.rpc('admin_finance_add', {
      p_kind: fKind, p_category: fCat, p_amount: amount, p_date: fDate || null, p_note: fNote || null,
    });
    setSaving(false);
    const res = data as { success: boolean; message?: string } | null;
    if (e || !res?.success) { setError(e?.message ?? res?.message ?? 'Gagal menyimpan.'); return; }
    setShowForm(false);
    reload();
  };

  const deleteEntry = async (en: Entry) => {
    const extra = en.source === 'recurring' ? '\n\nCatatan rutin ini tidak akan dibuat ulang untuk bulan ini.' : '';
    if (!window.confirm(`Hapus catatan ${catLabel(en.category)} sebesar ${rp(en.amount)}?${extra}`)) return;
    const { data, error: e } = await supabase.rpc('admin_finance_delete', { p_id: en.id });
    const res = data as { success: boolean; message?: string } | null;
    if (e || !res?.success) { setError(e?.message ?? res?.message ?? 'Gagal menghapus.'); return; }
    reload();
  };

  const saveRec = async (category: string, amount: number, day: number, note: string) => {
    const { data, error: e } = await supabase.rpc('admin_finance_recurring_save', {
      p_id: null, p_category: category, p_amount: amount, p_day: day, p_note: note, p_active: true, p_start: null,
    });
    const res = data as { success: boolean; message?: string } | null;
    if (e || !res?.success) { setError(e?.message ?? res?.message ?? 'Gagal menyimpan.'); return; }
    reload();
  };

  const toggleRec = async (r: Rec) => {
    const { error: e } = await supabase.rpc('admin_finance_recurring_save', {
      p_id: r.id, p_category: r.category, p_amount: r.amount, p_day: r.day_of_month, p_note: r.note, p_active: !r.active, p_start: null,
    });
    if (e) { setError(e.message); return; }
    reload();
  };

  const deleteRec = async (r: Rec) => {
    if (!window.confirm(`Hapus aturan rutin ${catLabel(r.category)} ${rp(r.amount)}? Catatan yang sudah dibuat tetap ada.`)) return;
    const { error: e } = await supabase.rpc('admin_finance_recurring_delete', { p_id: r.id });
    if (e) { setError(e.message); return; }
    reload();
  };

  const exportCsv = () => {
    if (!summary) return;
    const q = (v: string | number | null) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows: (string | number | null)[][] = [
      ['Tanggal', 'Jenis', 'Kategori', 'Nominal', 'Catatan', 'Sumber'],
      [month, 'Pendapatan', 'Komisi trip (otomatis)', summary.komisi, '', 'otomatis'],
      [month, 'Pendapatan', 'Biaya platform (otomatis)', summary.platform_fee, '', 'otomatis'],
      ...entries.map(e => [e.entry_date, e.kind === 'income' ? 'Pendapatan' : 'Pengeluaran', catLabel(e.category), e.amount, e.note, e.source]),
    ];
    const csv = '﻿' + rows.map(r => r.map(q).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `keuangan-${month.slice(0, 7)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const maxBar = Math.max(1, ...months.flatMap(m => [m.income, m.expense]));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Keuangan</h2>
          <p className="text-sm text-slate-500 mt-1">Perkiraan pendapatan, pengeluaran, dan laba bersih. Untuk pemantauan, bukan pembukuan pajak.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <button onClick={() => changeMonth(-1)} className="px-4 py-2 text-sm rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] hover:bg-white">Sebelumnya</button>
          <span className="text-sm font-semibold text-slate-800 min-w-[130px] text-center">{monthLabel(month)}</span>
          <button onClick={() => changeMonth(1)} disabled={isCurrentMonth} className="px-4 py-2 text-sm rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] hover:bg-white disabled:opacity-40">Berikutnya</button>
          <button onClick={reload} className="p-2.5 rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] hover:bg-white" aria-label="Muat ulang"><RefreshCw className="w-4 h-4 text-slate-600" /></button>
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] hover:bg-white"><Download className="w-4 h-4" />CSV</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] hover:bg-white"><Printer className="w-4 h-4" />Cetak</button>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-2xl px-4 py-3">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading && !summary ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Memuat data keuangan</div>
      ) : summary && (
        <>
          <section>
            <h3 className="text-sm font-bold text-slate-700 mb-2">Pendapatan</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card title="Komisi trip" value={rp(summary.komisi)} sub={`${summary.trips_completed} trip selesai, nilai trip ${rp(summary.gmv)}`} />
              <Card title="Biaya platform" value={rp(summary.platform_fee)} sub="Rp1.000 per trip selesai" />
              <Card title="Langganan dan lencana" value={rp((summary.income_by_category.langganan_tolongin ?? 0) + (summary.income_by_category.lencana_terbaik ?? 0))} sub="Sobat Tolongin" />
              <Card title="Iklan dan lainnya" value={rp((summary.income_by_category.iklan ?? 0) + (summary.income_by_category.lainnya_masuk ?? 0))} sub="Dicatat manual" />
            </div>
          </section>

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card title="Total pendapatan" value={rp(summary.income_total)} sub={delta(summary.income_total, summary.prev_income) ?? undefined} />
            <Card title="Total pengeluaran" value={rp(summary.expense_total)} sub={delta(summary.expense_total, summary.prev_expense) ?? undefined} />
            <Card title="Laba bersih (estimasi)" value={rp(summary.net)} hero={summary.net >= 0} tone={summary.net >= 0 ? 'good' : 'bad'} sub={delta(summary.net, summary.prev_net) ?? undefined} />
            <Card title="Margin" value={summary.income_total > 0 ? ((summary.net / summary.income_total) * 100).toFixed(0) + '%' : '-'} sub="Laba dibagi pendapatan" />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/80 backdrop-blur border border-white rounded-3xl p-5 shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Pengeluaran per kategori</h3>
              {Object.keys(summary.expense_by_category).length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada pengeluaran bulan ini.</p>
              ) : (
                <ul className="space-y-2">
                  {Object.entries(summary.expense_by_category).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
                    <li key={c} className="text-sm">
                      <div className="flex justify-between"><span className="text-slate-700">{catLabel(c)}</span><span className="font-semibold text-slate-900">{rp(v)}</span></div>
                      <div className="h-1.5 bg-slate-100 rounded-full mt-1"><div className="h-1.5 bg-gradient-to-r from-[#4a98ad] to-[#2f7088] rounded-full" style={{ width: `${Math.max(3, (v / Math.max(1, summary.expense_total)) * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-white/80 backdrop-blur border border-white rounded-3xl p-5 shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Enam bulan terakhir</h3>
              <div className="flex items-end gap-3 h-36">
                {months.map(m => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="flex items-end gap-1 h-28 w-full justify-center">
                      <div className="w-3 bg-emerald-500 rounded-t" style={{ height: `${(m.income / maxBar) * 100}%` }} title={`Pendapatan ${rp(m.income)}`} />
                      <div className="w-3 bg-rose-400 rounded-t" style={{ height: `${(m.expense / maxBar) * 100}%` }} title={`Pengeluaran ${rp(m.expense)}`} />
                    </div>
                    <span className="text-[11px] text-slate-500">{shortMonth(m.month)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2"><span className="inline-block w-2 h-2 bg-emerald-500 rounded-sm mr-1" />Pendapatan <span className="inline-block w-2 h-2 bg-rose-400 rounded-sm ml-3 mr-1" />Pengeluaran</p>
            </div>
          </section>

          <section className="bg-amber-50/90 border border-amber-200 rounded-3xl p-5">
            <h3 className="text-sm font-semibold text-amber-900">Saldo driver (kewajiban, bukan pendapatan)</h3>
            <p className="text-xs text-amber-800 mt-1">Uang top-up driver adalah titipan yang akan terpakai untuk komisi. Baru jadi pendapatan saat dipotong dari trip, jadi tidak dihitung di atas.</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              <Card title="Total saldo driver" value={rp(summary.driver_balance_total)} />
              <Card title="Saldo positif" value={rp(summary.driver_balance_positive)} sub="Titipan driver" />
              <Card title="Saldo minus" value={rp(summary.driver_balance_negative)} sub="Piutang ke driver" />
              <Card title="Top-up bulan ini" value={rp(summary.topup_month)} sub={summary.correction_month ? `Koreksi ${rp(summary.correction_month)}` : undefined} />
            </div>
          </section>

          <section className="bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)] print:hidden overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4">
              <div className="flex gap-1">
                {(['catatan', 'rutin'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`px-3 py-3 text-sm font-semibold border-b-2 ${tab === t ? 'border-[#2f7088] text-[#2f7088]' : 'border-transparent text-slate-500'}`}>
                    {t === 'catatan' ? 'Catatan bulan ini' : 'Pengeluaran rutin'}
                  </button>
                ))}
              </div>
              {tab === 'catatan' && (
                <div className="flex gap-2 py-2">
                  <button onClick={() => openForm('income')} className="inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"><Plus className="w-4 h-4" />Pendapatan</button>
                  <button onClick={() => openForm('expense')} className="inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-full border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"><Plus className="w-4 h-4" />Pengeluaran</button>
                </div>
              )}
            </div>

            {tab === 'catatan' ? (
              <div className="overflow-x-auto">
                {entries.length === 0 ? (
                  <p className="text-sm text-slate-500 p-6">Belum ada catatan bulan ini. Komisi dan biaya platform dihitung otomatis dari trip.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <tr><th className="text-left px-4 py-2">Tanggal</th><th className="text-left px-4 py-2">Kategori</th><th className="text-left px-4 py-2">Catatan</th><th className="text-right px-4 py-2">Nominal</th><th className="px-4 py-2" /></tr>
                    </thead>
                    <tbody>
                      {entries.map(en => (
                        <tr key={en.id} className="border-t border-slate-100">
                          <td className="px-4 py-2 whitespace-nowrap">{new Date(en.entry_date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</td>
                          <td className="px-4 py-2">{catLabel(en.category)}{en.source !== 'manual' && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{en.source === 'auto' ? 'otomatis' : 'rutin'}</span>}</td>
                          <td className="px-4 py-2 text-slate-600">{en.note ?? '-'}</td>
                          <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${en.kind === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>{en.kind === 'income' ? '+' : '-'}{rp(en.amount)}</td>
                          <td className="px-4 py-2 text-right"><button onClick={() => deleteEntry(en)} aria-label="Hapus" className="text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <p className="text-xs text-slate-500">Aturan di sini otomatis dicatat setiap bulan pada tanggal yang dipilih. Nominal awal hanya perkiraan, ubah sesuai tagihan sebenarnya.</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map(t => (
                    <button key={t.note} onClick={() => { setRCat(t.category); setRAmount(String(t.amount)); setRNote(t.note); }} className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-full hover:bg-slate-50">{t.note}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 items-end">
                  <label className="text-xs text-slate-600">Kategori
                    <select value={rCat} onChange={e => setRCat(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
                      {Object.entries(EXPENSE_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">Nominal (Rp)
                    <input value={rAmount} onChange={e => setRAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-600">Tanggal tiap bulan (1-28)
                    <input value={rDay} onChange={e => setRDay(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-600">Catatan
                    <input value={rNote} onChange={e => setRNote(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <button
                    onClick={() => { const a = parseInt(rAmount, 10); const d = parseInt(rDay, 10); if (!a || !d) { setError('Isi nominal dan tanggal (1 sampai 28).'); return; } saveRec(rCat, a, d, rNote); setRAmount(''); setRNote(''); }}
                    className="px-5 py-2 text-sm font-semibold rounded-full bg-gradient-to-b from-[#4a98ad] to-[#2f7088] text-white shadow-md hover:opacity-90">Tambah aturan</button>
                </div>
                {recs.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada pengeluaran rutin. Klik salah satu contoh di atas untuk mulai.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                    {recs.map(r => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <div className={r.active ? '' : 'opacity-50'}>
                          <p className="font-semibold text-slate-800">{catLabel(r.category)} <span className="font-normal text-slate-500">{r.note ? `(${r.note})` : ''}</span></p>
                          <p className="text-xs text-slate-500">Tiap tanggal {r.day_of_month}, mulai {new Date(r.start_date + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{rp(r.amount)}</span>
                          <button onClick={() => toggleRec(r)} className="text-xs px-3 py-1 border border-slate-200 rounded-full hover:bg-slate-50">{r.active ? 'Jeda' : 'Aktifkan'}</button>
                          <button onClick={() => deleteRec(r)} aria-label="Hapus" className="text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 print:hidden">
          <div className="bg-[#f6f8fc] rounded-3xl shadow-xl w-full max-w-md p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{fKind === 'income' ? 'Catat pendapatan' : 'Catat pengeluaran'}</h3>
              <button onClick={() => setShowForm(false)} aria-label="Tutup"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <label className="block text-xs text-slate-600">Kategori
              <select value={fCat} onChange={e => setFCat(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
                {Object.entries(fKind === 'income' ? INCOME_CATS : EXPENSE_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block text-xs text-slate-600">Nominal (Rp)
              <input value={fAmount} onChange={e => setFAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs text-slate-600">Tanggal (kosong = hari ini)
              <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs text-slate-600">Catatan
              <input value={fNote} onChange={e => setFNote(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
            </label>
            <button onClick={submitEntry} disabled={saving} className="w-full py-2.5 rounded-full bg-gradient-to-b from-[#4a98ad] to-[#2f7088] text-white text-sm font-semibold shadow-md hover:opacity-90 disabled:opacity-60">
              {saving ? 'Menyimpan' : 'Simpan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}