'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import {
  Flag,
  Search,
  X,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
  CheckCircle2,
  Eye,
  RotateCcw,
  UserX,
  ExternalLink,
  AlertTriangle,
  Info,
} from 'lucide-react';

type ReportStatus = 'open' | 'reviewed' | 'closed';

interface Report {
  id: string;
  created_at: string;
  context: string;
  context_id: string | null;
  reason: string;
  note: string | null;
  status: ReportStatus;
  reporter_id: string;
  reporter_name: string;
  reported_id: string | null;
  reported_name: string;
  reported_total: number;
  reported_partner_id: string | null;
  reported_partner_active: boolean | null;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  has_image: boolean;
  kind: string;
  created_at: string;
}

const STATUS_META: Record<ReportStatus, { label: string; chip: string; dot: string }> = {
  open: { label: 'Terbuka', chip: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  reviewed: { label: 'Ditinjau', chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  closed: { label: 'Selesai', chip: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

const CONTEXT_LABEL: Record<string, string> = {
  tolongin_chat: 'Chat Tolongin',
  order_chat: 'Chat Pim Ride',
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function tint(tone: string) {
  if (tone.includes('amber')) return 'from-[#f9e6c6] to-[#efcd96]';
  if (tone.includes('rose')) return 'from-[#f7d9de] to-[#ebb0ba]';
  if (tone.includes('emerald')) return 'from-[#c6ebe1] to-[#98d4c9]';
  if (tone.includes('blue')) return 'from-[#d9e8f4] to-[#b6d0e4]';
  return 'from-[#e8edf4] to-[#cfd9e6]';
}

export default function LaporanPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('open');
  const [contextFilter, setContextFilter] = useState<'all' | string>('all');
  const [query, setQuery] = useState('');

  const [selected, setSelected] = useState<Report | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;

    async function run() {
      const { data, error: err } = await supabase.rpc('admin_reports_list', { p_status: null });
      if (!alive) return;
      if (err) {
        setError(`Gagal memuat laporan: ${err.message}`);
      } else {
        setError(null);
        setReports((data as Report[]) ?? []);
      }
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

  async function openReport(r: Report) {
    setSelected(r);
    setMessages([]);
    setMessagesError(null);
    setMessagesLoading(true);
    const { data, error: err } = await supabase.rpc('admin_report_messages', { p_report_id: r.id });
    if (err) setMessagesError(err.message);
    else setMessages((data as ChatMessage[]) ?? []);
    setMessagesLoading(false);
  }

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  async function setStatus(r: Report, status: ReportStatus) {
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_set_report_status', {
      p_report_id: r.id,
      p_status: status,
    });
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (err || !res?.success) {
      alert(`Gagal mengubah status: ${err?.message ?? res?.message ?? 'tidak diketahui'}`);
      return;
    }
    setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    setSelected((cur) => (cur && cur.id === r.id ? { ...cur, status } : cur));
  }

  async function deactivatePartner(r: Report) {
    if (!r.reported_partner_id) return;
    const ok = window.confirm(
      `Nonaktifkan Sobat "${r.reported_name}"? Dia tidak akan muncul di aplikasi sampai kamu aktifkan lagi di halaman Sobat Tolongin.`
    );
    if (!ok) return;
    setBusy(true);
    const { error: err } = await supabase
      .from('tolongin_partners')
      .update({ is_active: false })
      .eq('id', r.reported_partner_id);
    setBusy(false);
    if (err) {
      alert(`Gagal menonaktifkan: ${err.message}`);
      return;
    }
    const patch = { reported_partner_active: false };
    setReports((prev) => prev.map((x) => (x.reported_id === r.reported_id ? { ...x, ...patch } : x)));
    setSelected((cur) => (cur ? { ...cur, ...patch } : cur));
  }

  const counts = useMemo(() => {
    const c = { open: 0, reviewed: 0, closed: 0 };
    reports.forEach((r) => {
      c[r.status] += 1;
    });
    return c;
  }, [reports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (contextFilter !== 'all' && r.context !== contextFilter) return false;
      if (!q) return true;
      return (
        r.reported_name.toLowerCase().includes(q) ||
        r.reporter_name.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
      );
    });
  }, [reports, statusFilter, contextFilter, query]);

  const summaryCards: { key: 'all' | ReportStatus; label: string; value: number; tone: string }[] = [
    { key: 'open', label: 'Terbuka', value: counts.open, tone: 'text-rose-600' },
    { key: 'reviewed', label: 'Sedang ditinjau', value: counts.reviewed, tone: 'text-amber-600' },
    { key: 'closed', label: 'Selesai', value: counts.closed, tone: 'text-slate-700' },
    { key: 'all', label: 'Semua laporan', value: reports.length, tone: 'text-slate-900' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Laporan Pengguna</h2>
          <p className="text-sm text-slate-500 mt-1">
            Laporan dari chat Tolongin dan chat Pim Ride. Baca isi obrolan, lalu tentukan tindakan.
          </p>
        </div>
        <button
          onClick={handleRefresh}
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
            <div className="text-xs text-rose-600/80 mt-0.5">
              Pastikan SQL &quot;Part AP&quot; sudah dijalankan di Supabase SQL Editor.
            </div>
          </div>
        </div>
      )}

      {/* Ringkasan sebagai filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((c) => {
          const active = statusFilter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setStatusFilter(c.key)}
              className={`text-left rounded-[22px] p-5 bg-gradient-to-br ${tint(c.tone)} transition shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)] ${
              active ? 'ring-2 ring-[#2f7088]' : 'hover:brightness-105'
            }`}
            >
              <div className="text-xs font-semibold text-slate-600">{c.label}</div>
              <div className={`mt-1.5 text-2xl font-extrabold tabular-nums text-slate-800`}>{loading ? '-' : c.value}</div>
            </button>
          );
        })}
      </div>

      {/* Tabel */}
      <section className="bg-white/90 border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)] overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama atau alasan laporan"
              className="w-full pl-9 pr-4 py-2 text-sm rounded-full border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select
            value={contextFilter}
            onChange={(e) => setContextFilter(e.target.value)}
            className="text-sm rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">Semua sumber</option>
            <option value="tolongin_chat">Chat Tolongin</option>
            <option value="order_chat">Chat Pim Ride</option>
          </select>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Memuat laporan...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <Flag className="w-6 h-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">Tidak ada laporan di sini</p>
            <p className="text-xs text-slate-400 mt-1">Ubah filter di atas untuk melihat laporan lain.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Dilaporkan</th>
                  <th className="px-3 py-3 font-semibold">Pelapor</th>
                  <th className="px-3 py-3 font-semibold">Sumber</th>
                  <th className="px-3 py-3 font-semibold">Alasan</th>
                  <th className="px-3 py-3 font-semibold">Waktu</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => openReport(r)}
                      className="hover:bg-slate-50/70 cursor-pointer transition"
                    >
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full border ${meta.chip}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="font-semibold text-slate-900">{r.reported_name}</div>
                        {r.reported_total > 1 && (
                          <div className="text-[11px] text-rose-600 font-medium">{r.reported_total} laporan total</div>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-slate-600">{r.reporter_name}</td>
                      <td className="px-3 py-3.5 text-slate-600">{CONTEXT_LABEL[r.context] ?? r.context}</td>
                      <td className="px-3 py-3.5 text-slate-700 max-w-[220px] truncate">{r.reason}</td>
                      <td className="px-3 py-3.5 text-slate-500 whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                          <Eye className="w-3.5 h-3.5" /> Tinjau
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Panel detail */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={() => setSelected(null)} />
          <aside className="relative w-full max-w-xl bg-[#f6f8fc] h-full shadow-2xl flex flex-col sm:rounded-l-3xl overflow-hidden">
            <div className="px-6 h-16 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-slate-900">Detail laporan</h3>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full border ${STATUS_META[selected.status].chip}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[selected.status].dot}`} />
                  {STATUS_META[selected.status].label}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Info */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Dilaporkan</dt>
                  <dd className="font-semibold text-slate-900 mt-0.5">{selected.reported_name}</dd>
                  {selected.reported_total > 1 && (
                    <dd className="text-[11px] text-rose-600 font-medium">{selected.reported_total} laporan total</dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Pelapor</dt>
                  <dd className="font-semibold text-slate-900 mt-0.5">{selected.reporter_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Sumber</dt>
                  <dd className="text-slate-800 mt-0.5">{CONTEXT_LABEL[selected.context] ?? selected.context}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Waktu</dt>
                  <dd className="text-slate-800 mt-0.5">{fmtDateTime(selected.created_at)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-slate-400">Alasan</dt>
                  <dd className="text-slate-900 font-medium mt-0.5">{selected.reason}</dd>
                  {selected.note && (
                    <dd className="mt-2 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 leading-relaxed">
                      {selected.note}
                    </dd>
                  )}
                </div>
              </dl>

              {selected.context === 'order_chat' && selected.status !== 'closed' && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800 leading-relaxed">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Obrolan Pim Ride ini ditahan dari penghapusan otomatis selama laporan belum berstatus Selesai.
                    Setelah kamu menutup laporan, isi obrolan dihapus pada pembersihan berikutnya.
                  </span>
                </div>
              )}

              {/* Transkrip */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Isi obrolan</h4>
                <div className="mt-3 rounded-2xl border border-white bg-white shadow-sm p-3 max-h-[380px] overflow-y-auto space-y-2">
                  {messagesLoading ? (
                    <div className="py-8 flex justify-center text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : messagesError ? (
                    <p className="text-sm text-rose-600 py-4 text-center">{messagesError}</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">
                      Tidak ada pesan tersimpan. Obrolan mungkin sudah dihapus otomatis.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const fromReported = m.sender_id === selected.reported_id;
                      return (
                        <div key={m.id} className={`flex ${fromReported ? 'justify-start' : 'justify-end'}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                              fromReported
                                ? 'bg-rose-50 border border-rose-100 text-slate-800 rounded-bl-md'
                                : 'bg-white border border-slate-200 text-slate-800 rounded-br-md'
                            }`}
                          >
                            <div className={`text-[11px] font-semibold ${fromReported ? 'text-rose-600' : 'text-slate-500'}`}>
                              {m.sender_name}
                              {fromReported ? ' (dilaporkan)' : ''}
                            </div>
                            {m.kind !== 'text' && (
                              <div className="text-[11px] text-slate-400 italic">pesan {m.kind === 'offer' ? 'tawaran' : 'sistem'}</div>
                            )}
                            {m.text && <div className="mt-0.5 whitespace-pre-wrap break-words">{m.text}</div>}
                            {m.has_image && (
                              <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <ImageIcon className="w-3 h-3" /> Foto terlampir
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 mt-1 text-right">{fmtTime(m.created_at)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Foto tidak ditampilkan di dashboard demi privasi; hanya ditandai.
                </p>
              </div>

              {selected.reported_partner_id && (
                <div className="rounded-2xl border border-white bg-white shadow-sm p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">Akun ini adalah Sobat Tolongin</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Status saat ini: {selected.reported_partner_active ? 'aktif di aplikasi' : 'dinonaktifkan'}
                    </div>
                  </div>
                  <Link
                    href="/tolongin"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 shrink-0"
                  >
                    Buka halaman Sobat <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {/* Aksi */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white shrink-0 flex flex-wrap items-center gap-2">
              {selected.status === 'open' && (
                <button
                  disabled={busy}
                  onClick={() => setStatus(selected, 'reviewed')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-60 transition"
                >
                  <Eye className="w-3.5 h-3.5" /> Tandai ditinjau
                </button>
              )}
              {selected.status !== 'closed' && (
                <button
                  disabled={busy}
                  onClick={() => setStatus(selected, 'closed')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-60 transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Tutup laporan
                </button>
              )}
              {selected.status !== 'open' && (
                <button
                  disabled={busy}
                  onClick={() => setStatus(selected, 'open')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold disabled:opacity-60 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Buka kembali
                </button>
              )}
              {selected.reported_partner_id && selected.reported_partner_active && (
                <button
                  disabled={busy}
                  onClick={() => deactivatePartner(selected)}
                  className="ml-auto inline-flex items-center gap-1.5 px-5 py-2 rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold disabled:opacity-60 transition"
                >
                  <UserX className="w-3.5 h-3.5" /> Nonaktifkan Sobat
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}