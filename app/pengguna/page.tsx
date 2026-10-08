'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Loader2, AlertTriangle, X, Ban, ShieldCheck, RefreshCw } from 'lucide-react';

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

  const open = (id: string) => { setSel(id); setDetail(null); setDetailLoading(true); setReason(''); setOkMsg(''); };
  const reload = () => { setLoading(true); setReloadKey((k) => k + 1); };

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
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}