'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Loader2, AlertTriangle, X, Ban, ShieldCheck, RefreshCw, Download } from 'lucide-react';

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  is_driver: boolean;
  is_staff: boolean;
  trips: number;
  reports_against: number;
  blocked: boolean;
}
interface OrderRow { id: string; status: string; service_type: string | null; as: string; price: number | null; pickup: string | null; destination: string | null; created_at: string }
interface ReportRow { reason: string; status: string; created_at: string }
interface Detail extends Omit<UserRow, 'trips' | 'reports_against' | 'blocked'> {
  block: { reason: string; at: string; by: string | null } | null;
  orders: OrderRow[];
  reports_against: ReportRow[];
  reports_made: number;
}

const CARD = 'bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]';
const GRAD = 'bg-gradient-to-b from-[#4a98ad] to-[#2f7088]';

function fmt(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function rp(n: number | null) { return n == null ? '-' : 'Rp ' + new Intl.NumberFormat('id-ID').format(n); }
function errText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Terjadi kesalahan.';
}

type UTab = 'ringkas' | 'riwayat';
type HistFilter = 'all' | 'report' | 'action' | 'doc';
interface HistItem {
  kind: 'report' | 'action' | 'doc';
  report_id: string | null;
  at: string;
  action: string | null;
  actor_name: string | null;
  reporter_name: string | null;
  reason: string | null;
  note: string | null;
  status: string | null;
  context: string | null;
  context_id: string | null;
  detail: Record<string, unknown> | null;
}
interface HistData {
  summary: { reports_total: number; reports_open: number; pauses: number; blocks: number; unblocks: number; blocked_now: boolean };
  items: HistItem[];
  total: number;
  has_more: boolean;
  names_visible: boolean;
}

const HIST_PAGE = 10;
const REPORT_STATUS: Record<string, string> = { open: 'Belum ditinjau', reviewed: 'Sudah ditinjau', closed: 'Selesai' };
const REPORT_CONTEXT: Record<string, string> = { tolongin_chat: 'Chat Tolongin', order_chat: 'Chat perjalanan' };
const DOC_LABEL: Record<string, string> = { ktp: 'KTP', sim: 'SIM', stnk: 'STNK', vehicle_photo: 'Foto Kendaraan' };
const HIST_TONE: Record<'red' | 'amber' | 'green' | 'slate', string> = {
  red: 'bg-rose-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  slate: 'bg-slate-400',
};

function sv(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}
function escHtml(t: unknown): string {
  return String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function histText(it: HistItem): { title: string; body: string; tone: 'red' | 'amber' | 'green' | 'slate' } {
  const d = it.detail ?? {};
  const a = it.action ?? '';
  if (it.kind === 'report') {
    return {
      title: `Dilaporkan${it.reporter_name ? ` oleh ${it.reporter_name}` : ''}`,
      body: `Alasan: ${it.reason ?? '-'}${it.note ? `. Catatan: ${it.note}` : ''}`,
      tone: it.status === 'open' ? 'red' : 'amber',
    };
  }
  if (a === 'driver_deactivate')
    return {
      title: d.kind === 'permanent' ? 'Diblokir permanen sebagai mitra' : 'Dinonaktifkan sementara',
      body: `Alasan: ${sv(d.label)}${d.note ? `. ${sv(d.note)}` : ''}`,
      tone: 'red',
    };
  if (a === 'driver_unban') return { title: 'Blokir permanen dibuka', body: `Alasan buka: ${sv(d.note)}`, tone: 'amber' };
  if (a === 'user_block') return { title: 'Akun diblokir', body: `Alasan: ${sv(d.reason)}`, tone: 'red' };
  if (a === 'user_unblock') return { title: 'Blokir akun dibuka', body: '', tone: 'green' };
  if (a === 'history_export') return { title: 'Dokumen riwayat diekspor', body: '', tone: 'slate' };
  if (a === 'driver_status_approved') return { title: 'Driver diaktifkan', body: '', tone: 'green' };
  if (a === 'driver_status_rejected') return { title: 'Driver ditolak atau dinonaktifkan', body: '', tone: 'amber' };
  if (a === 'driver_status_pending') return { title: 'Driver dikembalikan ke menunggu', body: '', tone: 'amber' };
  if (a === 'driver_doc_approved') return { title: 'Dokumen disetujui', body: DOC_LABEL[sv(d.document)] ?? sv(d.document), tone: 'green' };
  if (a === 'driver_doc_rejected')
    return { title: 'Dokumen ditolak', body: `${DOC_LABEL[sv(d.document)] ?? sv(d.document)}. Alasan: ${sv(d.reason)}`, tone: 'red' };
  return { title: a, body: '', tone: 'slate' };
}

export default function PenggunaPage() {
  const [role, setRole] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [pTitle, setPTitle] = useState('');
  const [pBody, setPBody] = useState('');
  const [tab, setTab] = useState<UTab>('ringkas');
  const [hist, setHist] = useState<HistData | null>(null);
  const [histFilter, setHistFilter] = useState<HistFilter>('all');
  const [histLoadedKey, setHistLoadedKey] = useState('');
  const [histMoreBusy, setHistMoreBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { data } = await supabase.rpc('my_admin_role');
      if (alive) setRole((data as string | null) ?? 'owner');
    };
    run();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { data, error: e } = await supabase.rpc('admin_users_search', { p_query: query || null, p_limit: 60 });
      if (!alive) return;
      if (e) setError(e.message + ' Pastikan SQL Part BB sudah dijalankan di Supabase SQL Editor.');
      else { setRows((data ?? []) as UserRow[]); setError(''); }
      setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [query, reloadKey]);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    const run = async () => {
      const { data, error: e } = await supabase.rpc('admin_user_detail', { p_user: sel });
      if (!alive) return;
      if (e) setError(errText(e));
      else setDetail(data as Detail);
      setDetailLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [sel, reloadKey]);

  const open = (id: string) => {
    setSel(id); setDetail(null); setDetailLoading(true); setReason(''); setPTitle(''); setPBody(''); setOkMsg('');
    setTab('ringkas'); setHist(null); setHistFilter('all'); setHistLoadedKey('');
  };
  const reload = () => { setLoading(true); setReloadKey((k) => k + 1); };

  const histKey = `${sel ?? ''}|${histFilter}|${reloadKey}`;
  const histLoading = tab === 'riwayat' && !!sel && histLoadedKey !== histKey;

  useEffect(() => {
    if (!sel || tab !== 'riwayat') return;
    let alive = true;
    const key = `${sel}|${histFilter}|${reloadKey}`;
    (async () => {
      const { data, error: err } = await supabase.rpc('admin_person_history', {
        p_user: sel,
        p_filter: histFilter,
        p_limit: HIST_PAGE,
        p_offset: 0,
      });
      if (!alive) return;
      if (err) setError(`Gagal memuat riwayat: ${err.message}. Pastikan SQL Part BK sudah dijalankan.`);
      else setHist(data as HistData);
      setHistLoadedKey(key);
    })();
    return () => { alive = false; };
  }, [sel, tab, histFilter, reloadKey]);

  const loadMoreHist = async () => {
    if (!sel || !hist || histMoreBusy) return;
    setHistMoreBusy(true);
    const { data, error: err } = await supabase.rpc('admin_person_history', {
      p_user: sel,
      p_filter: histFilter,
      p_limit: HIST_PAGE,
      p_offset: hist.items.length,
    });
    setHistMoreBusy(false);
    if (err) { setError(`Gagal memuat: ${err.message}`); return; }
    const more = data as HistData;
    setHist({ ...more, items: [...hist.items, ...more.items] });
  };

  const exportHistoryPdf = async () => {
    if (!detail || exporting) return;
    // Jendela dibuka dulu (sebelum menunggu data) supaya tidak diblokir browser
    const w = window.open('', '_blank');
    if (!w) { setError('Browser memblokir jendela baru. Izinkan pop-up untuk situs ini, lalu coba lagi.'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:24px">Menyiapkan dokumen...</p>');
    setExporting(true);
    try {
      const { data, error: err } = await supabase.rpc('admin_person_history', {
        p_user: detail.id, p_filter: 'all', p_limit: 500, p_offset: 0,
      });
      if (err) throw new Error(err.message);
      const full = data as HistData;
      if (!full.names_visible) throw new Error('Peranmu tidak boleh mengekspor dokumen ini.');

      // Cuplikan percakapan dari laporan (maksimal 15 laporan terbaru)
      const chats: Record<string, { sender_name: string; text: string; has_image: boolean; created_at: string }[]> = {};
      const reports = full.items.filter((i) => i.kind === 'report' && i.report_id).slice(0, 15);
      await Promise.all(
        reports.map(async (r) => {
          const res = await supabase.rpc('admin_report_messages', { p_report_id: r.report_id });
          if (!res.error && Array.isArray(res.data)) chats[r.report_id as string] = res.data as never;
        })
      );

      const { data: userRes } = await supabase.auth.getUser();
      const who = userRes?.user?.email ?? 'admin';
      await supabase.rpc('admin_log_history_export', { p_user: detail.id });

      const sm = full.summary;
      const rows = full.items
        .map((it) => {
          const t = histText(it);
          const kindLabel = it.kind === 'report' ? 'Laporan' : it.kind === 'doc' ? 'Dokumen' : 'Tindakan admin';
          const by = it.kind === 'report' ? '' : ` (oleh ${escHtml(it.actor_name)})`;
          const meta =
            it.kind === 'report'
              ? `<div class="meta">Status: ${escHtml(REPORT_STATUS[it.status ?? ''] ?? it.status)}${
                  it.context ? ` | Sumber: ${escHtml(REPORT_CONTEXT[it.context] ?? it.context)}` : ''
                }${it.context_id ? ` | Ref: ${escHtml(it.context_id)}` : ''}</div>`
              : '';
          const chat = it.report_id && chats[it.report_id]?.length
            ? `<div class="chat"><b>Cuplikan percakapan</b>${chats[it.report_id]
                .map(
                  (m) =>
                    `<div>[${escHtml(fmtFull(m.created_at))}] <b>${escHtml(m.sender_name)}</b>: ${escHtml(m.text)}${
                      m.has_image ? ' <i>(mengirim foto)</i>' : ''
                    }</div>`
                )
                .join('')}</div>`
            : '';
          return `<tr><td class="w1">${escHtml(fmtFull(it.at))}</td><td class="w2">${kindLabel}</td><td><b>${escHtml(
            t.title
          )}</b>${by}<div>${escHtml(t.body)}</div>${meta}${chat}</td></tr>`;
        })
        .join('');

      const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Riwayat ${escHtml(
        detail.full_name ?? 'Pengguna'
      )} - PimPim</title><style>
        @page { size: A4; margin: 16mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; line-height: 1.45; }
        h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
        .sub { color: #555; margin-bottom: 14px; }
        table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #bbb; padding: 6px 8px; vertical-align: top; text-align: left; }
        th { background: #eee; } .w1 { width: 118px; white-space: nowrap; } .w2 { width: 86px; }
        .kv td { border: none; padding: 2px 8px 2px 0; } .meta { color: #555; margin-top: 3px; font-size: 11px; }
        .chat { margin-top: 6px; padding: 6px 8px; background: #f4f4f4; border-left: 3px solid #999; font-size: 11px; }
        .foot { margin-top: 22px; font-size: 10.5px; color: #555; border-top: 1px solid #999; padding-top: 8px; }
        tr { page-break-inside: avoid; }
      </style></head><body>
        <h1>Dokumen Riwayat Pengguna - PimPim</h1>
        <div class="sub">Dibuat pada ${escHtml(fmtFull(new Date().toISOString()))} oleh ${escHtml(who)}</div>
        <h2>Identitas</h2>
        <table class="kv">
          <tr><td>Nama</td><td>: ${escHtml(detail.full_name ?? '-')}</td></tr>
          <tr><td>Email</td><td>: ${escHtml(detail.email ?? '-')}</td></tr>
          <tr><td>Nomor HP</td><td>: ${escHtml(detail.phone ?? '-')}</td></tr>
          <tr><td>Peran</td><td>: ${detail.is_driver ? 'Pengguna dan mitra driver' : 'Pengguna (penumpang)'}</td></tr>
          <tr><td>ID akun</td><td>: ${escHtml(detail.id)}</td></tr>
          <tr><td>Terdaftar</td><td>: ${escHtml(fmtFull(detail.created_at))}</td></tr>
          <tr><td>Status sekarang</td><td>: ${sm.blocked_now || detail.block ? 'Akun diblokir' : 'Aktif'}</td></tr>
        </table>
        <h2>Ringkasan</h2>
        <table class="kv">
          <tr><td>Total laporan</td><td>: ${sm.reports_total} (${sm.reports_open} belum ditinjau)</td></tr>
          <tr><td>Nonaktif sementara</td><td>: ${sm.pauses} kali</td></tr>
          <tr><td>Diblokir</td><td>: ${sm.blocks} kali</td></tr>
          <tr><td>Blokir dibuka</td><td>: ${sm.unblocks} kali</td></tr>
        </table>
        <h2>Kronologi (terbaru di atas)</h2>
        ${rows ? `<table><tr><th>Waktu</th><th>Jenis</th><th>Rincian</th></tr>${rows}</table>` : '<p>Belum ada catatan.</p>'}
        <div class="foot">Dokumen ini dihasilkan otomatis dari sistem PimPim dan berisi data pribadi yang bersifat rahasia. Gunakan hanya untuk keperluan penanganan laporan atau permintaan resmi pihak berwenang. Setiap ekspor tercatat di log aktivitas.</div>
      </body></html>`;
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    } catch (e) {
      w.close();
      setError(`Gagal membuat dokumen: ${e instanceof Error ? e.message : 'tidak diketahui'}`);
    } finally {
      setExporting(false);
    }
  };

  const doBlock = async () => {
    if (!detail) return;
    if (!window.confirm(`Blokir ${detail.full_name ?? detail.email}? Dia tidak bisa membuat pesanan atau menawar sebagai driver.`)) return;
    setBusy(true);
    const { data, error: e } = await supabase.rpc('admin_user_block', { p_user: detail.id, p_reason: reason });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (e) { setError(errText(e)); return; }
    if (!res?.success) { setError(res?.message ?? 'Gagal.'); return; }
    setError(''); setOkMsg('Pengguna diblokir.'); setReason(''); reload();
  };

  const doUnblock = async () => {
    if (!detail) return;
    if (!window.confirm(`Buka blokir ${detail.full_name ?? detail.email}?`)) return;
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_user_unblock', { p_user: detail.id });
    setBusy(false);
    if (e) { setError(errText(e)); return; }
    setError(''); setOkMsg('Blokir dibuka.'); reload();
  };

  const doPush = async () => {
    if (!detail) return;
    setBusy(true);
    const { data, error: e } = await supabase.rpc('admin_user_push', { p_user: detail.id, p_title: pTitle, p_body: pBody });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (e) { setError(errText(e)); return; }
    if (!res?.success) { setError(res?.message ?? 'Gagal.'); return; }
    setError(''); setOkMsg('Notifikasi terkirim.'); setPTitle(''); setPBody('');
  };

  const canUnblock = role === 'owner' || role === 'admin';
  const input = 'w-full text-sm rounded-full border border-slate-200 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Pengguna</h2>
          <p className="text-sm text-slate-500 mt-1">Cari pengguna lewat nama, email, atau nomor HP. Lihat riwayatnya dan blokir bila perlu.</p>
        </div>
        <button onClick={reload} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] text-xs font-semibold text-slate-700 hover:bg-white w-fit">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Muat ulang
        </button>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-2xl px-4 py-3">
          <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</span>
          <button onClick={() => setError('')} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
      )}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl px-4 py-3">{okMsg}</div>}

      <form
        onSubmit={(e) => { e.preventDefault(); setLoading(true); setQuery(term.trim()); }}
        className="flex gap-2 max-w-xl"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nama, email, atau nomor HP" className={`${input} pl-10`} />
        </div>
        <button type="submit" className={`px-6 py-2 rounded-full ${GRAD} text-white text-xs font-semibold shadow-md hover:opacity-90`}>Cari</button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-5 items-start">
        <section className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-3.5 border-b border-slate-100 text-sm font-bold text-slate-800">
            {query ? `Hasil untuk "${query}"` : 'Pengguna terbaru'} ({rows.length})
          </div>
          {loading && rows.length === 0 ? (
            <div className="py-16 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Tidak ada pengguna yang cocok.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((u) => (
                <li key={u.id}>
                  <button onClick={() => open(u.id)} className={`w-full text-left px-5 py-3 hover:bg-slate-50/70 transition flex items-center justify-between gap-3 ${sel === u.id ? 'bg-slate-50' : ''}`}>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{u.full_name ?? u.email ?? 'Tanpa nama'}</div>
                      <div className="text-xs text-slate-400 truncate">{u.email ?? '-'}{u.phone ? ` - ${u.phone}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {u.is_staff && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Staf</span>}
                      {u.is_driver && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">Driver</span>}
                      {u.reports_against > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200">{u.reports_against} laporan</span>}
                      {u.blocked && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">Diblokir</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className={`${CARD} p-5 lg:sticky lg:top-4`}>
          {!sel ? (
            <p className="text-sm text-slate-500">Pilih pengguna di daftar untuk melihat detail.</p>
          ) : detailLoading || !detail ? (
            <div className="py-10 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-lg font-extrabold text-slate-800">{detail.full_name ?? 'Tanpa nama'}</div>
                <div className="text-xs text-slate-500">{detail.email ?? '-'}</div>
                <div className="text-xs text-slate-500">{detail.phone ?? 'Nomor HP belum diisi'}</div>
                <div className="text-[11px] text-slate-400 mt-1">Daftar {fmt(detail.created_at)}. Pernah melaporkan orang lain {detail.reports_made} kali.</div>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-full text-xs font-semibold border border-slate-200">
                {([['ringkas', 'Ringkas'], ['riwayat', 'Laporan dan tindakan']] as [UTab, string][]).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`flex-1 px-3 py-1.5 rounded-full transition ${tab === k ? 'bg-white text-[#2f7088] shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {tab === 'riwayat' ? (
                <div>
                  {hist && (
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['Laporan', hist.summary.reports_total, hist.summary.reports_open > 0 ? `${hist.summary.reports_open} belum ditinjau` : 'semua ditinjau', hist.summary.reports_open > 0],
                        ['Nonaktif', hist.summary.pauses, 'sementara', false],
                        ['Diblokir', hist.summary.blocks, hist.summary.blocked_now ? 'aktif sekarang' : 'pernah', hist.summary.blocked_now],
                        ['Dibuka', hist.summary.unblocks, 'blokir dibuka', false],
                      ] as [string, number, string, boolean][]).map(([l, n, sub, warn]) => (
                        <div key={l} className={`rounded-xl border px-3 py-2 ${warn ? 'border-rose-200 bg-rose-50' : 'border-white bg-white'} shadow-sm`}>
                          <div className="text-[11px] text-slate-500">{l}</div>
                          <div className={`text-lg font-extrabold tabular-nums ${warn ? 'text-rose-700' : 'text-slate-800'}`}>{n}</div>
                          <div className={`text-[10.5px] ${warn ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>{sub}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    {([['all', 'Semua'], ['report', 'Laporan'], ['action', 'Tindakan admin']] as [HistFilter, string][]).map(([k, label]) => (
                      <button
                        key={k}
                        onClick={() => setHistFilter(k)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                          histFilter === k ? 'bg-[#2f7088] border-[#2f7088] text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    {hist?.names_visible && (
                      <button
                        onClick={exportHistoryPdf}
                        disabled={exporting}
                        className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Ekspor PDF
                      </button>
                    )}
                  </div>

                  {histLoading && !hist ? (
                    <div className="py-10 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                  ) : !hist || hist.items.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Belum ada catatan. Bersih.</p>
                  ) : (
                    <div className={`mt-4 ${histLoading ? 'opacity-60' : ''}`}>
                      <ol className="relative border-l-2 border-slate-200 ml-2 space-y-3">
                        {hist.items.map((it, i) => {
                          const t = histText(it);
                          return (
                            <li key={`${it.at}-${i}`} className="ml-4">
                              <span className={`absolute -left-[7px] mt-3 w-3 h-3 rounded-full border-2 border-white ${HIST_TONE[t.tone]}`} />
                              <div className="rounded-2xl border border-white bg-white shadow-sm px-3.5 py-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-[13px] font-semibold text-slate-900">{t.title}</div>
                                  <div className="text-[10.5px] text-slate-400 whitespace-nowrap">{fmt(it.at)}</div>
                                </div>
                                {t.body && <div className="text-xs text-slate-600 mt-1 leading-relaxed">{t.body}</div>}
                                <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                                  {it.kind !== 'report' && it.actor_name && <span>oleh {it.actor_name}</span>}
                                  {it.kind === 'report' && it.status && <span>{REPORT_STATUS[it.status] ?? it.status}</span>}
                                  {it.kind === 'report' && it.context && <span>{REPORT_CONTEXT[it.context] ?? it.context}</span>}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                      <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-500">
                        <span>Menampilkan {hist.items.length} dari {hist.total}</span>
                        {hist.has_more && (
                          <button
                            onClick={loadMoreHist}
                            disabled={histMoreBusy}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {histMoreBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Muat lebih banyak
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
              <>
              {detail.block ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-rose-700"><Ban className="w-4 h-4" />Sedang diblokir</div>
                  <p className="text-xs text-rose-800">Alasan: {detail.block.reason}</p>
                  <p className="text-[11px] text-rose-700/80">Oleh {detail.block.by ?? 'staf'} pada {fmt(detail.block.at)}</p>
                  {canUnblock ? (
                    <button onClick={doUnblock} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 disabled:opacity-60">
                      <ShieldCheck className="w-3.5 h-3.5" />Buka blokir
                    </button>
                  ) : (
                    <p className="text-[11px] text-rose-700">Hanya Admin atau Pemilik yang bisa membuka blokir.</p>
                  )}
                </div>
              ) : detail.is_staff ? (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-2xl p-3">Akun staf tidak bisa diblokir. Cabut aksesnya di Staf dan Peran.</p>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Alasan blokir (wajib)
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Contoh: order palsu berulang" className="mt-1 w-full text-sm rounded-2xl border border-slate-200 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400" />
                  </label>
                  <button onClick={doBlock} disabled={busy || reason.trim().length < 5} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-b from-[#e5566b] to-[#c53650] text-white text-xs font-semibold shadow-md hover:opacity-90 disabled:opacity-50">
                    <Ban className="w-3.5 h-3.5" />Blokir pengguna
                  </button>
                  <p className="text-[11px] text-slate-400">Pesanan yang sedang berjalan tidak ikut dibatalkan. Tangani manual bila perlu.</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700">Kirim notifikasi ke pengguna ini</div>
                <input value={pTitle} onChange={(e) => setPTitle(e.target.value)} maxLength={60} placeholder="Judul" className={input} />
                <textarea value={pBody} onChange={(e) => setPBody(e.target.value)} maxLength={240} rows={2} placeholder="Isi pesan" className="w-full text-sm rounded-2xl border border-slate-200 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                <button onClick={doPush} disabled={busy || pTitle.trim().length < 3 || pBody.trim().length < 3} className={`px-5 py-2 rounded-full ${GRAD} text-white text-xs font-semibold shadow-md hover:opacity-90 disabled:opacity-50`}>Kirim notifikasi</button>
                <p className="text-[11px] text-slate-400">Untuk siaran ke banyak orang, pakai halaman Banner Promo.</p>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 mb-1.5">Laporan terhadap pengguna ini ({detail.reports_against.length})</div>
                {detail.reports_against.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.reports_against.map((r, i) => (
                      <li key={i} className="text-xs rounded-xl bg-slate-50 px-3 py-2">
                        <span className="font-semibold text-slate-700">{r.reason}</span>
                        <span className="text-slate-400"> - {r.status} - {fmt(r.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 mb-1.5">Perjalanan terakhir</div>
                {detail.orders.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.orders.map((o) => (
                      <li key={o.id} className="text-xs rounded-xl bg-slate-50 px-3 py-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-slate-700">{o.service_type === 'car' ? 'Pim Car' : 'Pim Ride'} sebagai {o.as}</span>
                          <span className="text-slate-500">{o.status}</span>
                        </div>
                        <div className="text-slate-500 truncate">{o.pickup ?? '-'} ke {o.destination ?? '-'}</div>
                        <div className="text-slate-400">{rp(o.price)} - {fmt(o.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}