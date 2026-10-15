'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bell,
  Send,
  Loader2,
  X,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Smartphone,
  Users,
  Radio,
  Clock,
  Copy,
  ChevronLeft,
  ChevronRight,
  History,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Tipe data & konstanta                                                */
/* ------------------------------------------------------------------ */

type Target = 'all' | 'users' | 'partners';
type BroadcastStatus = 'sent' | 'failed';

interface Broadcast {
  id: string;
  created_at: string;
  actor_email: string | null;
  target: Target;
  title: string;
  body: string;
  status: BroadcastStatus;
  recipients: number;
  message: string | null;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

const TARGETS: { key: Target; label: string; hint: string }[] = [
  { key: 'all', label: 'Semua Warga', hint: 'Semua perangkat yang terdaftar' },
  { key: 'users', label: 'Pencari Hunian', hint: 'Pengguna biasa (penumpang & pencari kost)' },
  { key: 'partners', label: 'Mitra Sobat Tolongin', hint: 'Mitra yang sudah terdaftar' },
];

const TARGET_LABEL: Record<Target, string> = {
  all: 'Semua Warga',
  users: 'Pencari Hunian',
  partners: 'Mitra Sobat Tolongin',
};

const TITLE_MAX = 60;
const BODY_MAX = 240;
const COOLDOWN_SECONDS = 15;
const PAGE_SIZE = 10;

const TEMPLATES: { name: string; title: string; body: string }[] = [
  {
    name: 'Promo',
    title: 'Promo Spesial Hari Ini',
    body: 'Ada penawaran menarik untuk kamu. Buka aplikasi PimPim sekarang sebelum kehabisan.',
  },
  {
    name: 'Pembaruan aplikasi',
    title: 'Pembaruan PimPim Tersedia',
    body: 'Versi terbaru PimPim sudah ada di Play Store. Perbarui sekarang untuk fitur dan perbaikan terbaru.',
  },
  {
    name: 'Pemeliharaan',
    title: 'Pemeliharaan Sistem Terjadwal',
    body: 'PimPim akan menjalani pemeliharaan singkat. Layanan bisa terganggu sebentar. Terima kasih atas pengertiannya.',
  },
  {
    name: 'Layanan baru',
    title: 'Layanan PimPim Diperluas',
    body: 'PimPim kini melayani area baru. Buka aplikasi untuk melihat detailnya.',
  },
  {
    name: 'Lengkapi profil',
    title: 'Lengkapi Profilmu Yuk',
    body: 'Profil yang lengkap bikin pesananmu lebih cepat dan akunmu lebih aman.',
  },
];

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-full bg-gradient-to-b from-[#4a98ad] to-[#2f7088] text-white shadow-md hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] hover:bg-white transition disabled:opacity-50';

/* ------------------------------------------------------------------ */
/* Pembantu                                                             */
/* ------------------------------------------------------------------ */

function errMsg(err: unknown, fallback: string): string {
  return (err as { message?: string } | null)?.message || fallback;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '-';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  return fmtDateTime(iso);
}

function csvCell(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/* ------------------------------------------------------------------ */
/* Komponen kecil                                                       */
/* ------------------------------------------------------------------ */

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone: 'blue' | 'green' | 'violet' | 'slate';
}) {
  const hero = tone === 'blue';
  const bg: Record<string, string> = {
    blue: 'from-[#4a98ad] to-[#2f7088]',
    green: 'from-[#c6ebe1] to-[#98d4c9]',
    rose: 'from-[#f7d9de] to-[#ebb0ba]',
    violet: 'from-[#e8f0f7] to-[#cfdeea]',
    slate: 'from-[#e8f0f7] to-[#cfdeea]',
  };
  const color = hero ? 'text-white' : tone === 'green' ? 'text-emerald-900' : 'text-slate-800';
  const sub = hero ? 'text-white/80' : 'text-slate-600';
  return (
    <div className={`rounded-[22px] p-5 bg-gradient-to-br ${bg[tone]} shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)] flex items-start gap-3`}>
      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${hero ? 'bg-white/20 text-white' : 'bg-white/60 text-slate-700'}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>{label}</p>
        <p className={`text-xl font-extrabold mt-0.5 leading-tight ${color}`}>{value}</p>
        {hint && <p className={`text-xs mt-0.5 truncate ${sub}`}>{hint}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: BroadcastStatus }) {
  return status === 'sent' ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3" /> Terkirim
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
      <XCircle className="w-3 h-3" /> Gagal
    </span>
  );
}

function TargetBadge({ target }: { target: Target }) {
  return (
    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
      {TARGET_LABEL[target] || target}
    </span>
  );
}

function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60] max-w-sm">
      <div
        className={`flex items-start gap-2 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold text-white ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}
      >
        {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
        <span className="leading-snug">{toast.message}</span>
        <button onClick={onClose} className="ml-2 opacity-80 hover:opacity-100 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Pratinjau notifikasi seperti tampil di panel notifikasi Android */
function PhonePreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col items-center">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">
        <Smartphone className="w-3.5 h-3.5" /> Pratinjau di HP Pengguna
      </span>

      <div className="w-[250px] rounded-[28px] border-[6px] border-slate-800 bg-gradient-to-b from-slate-700 to-slate-900 shadow-xl overflow-hidden">
        <div className="h-5 flex justify-center">
          <div className="w-14 h-3 bg-slate-950 rounded-b-xl" />
        </div>
        <div className="px-3 pt-2 pb-6 min-h-[290px]">
          <div className="text-center text-white/90 text-3xl font-light tracking-tight mt-2">09.41</div>
          <div className="text-center text-white/50 text-[10px] mb-5">Kamis, 15 Oktober</div>

          <div className="bg-white/95 rounded-2xl p-3 shadow-lg">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-4 h-4 rounded-full bg-[#2f7088] text-white text-[8px] font-extrabold flex items-center justify-center">P</div>
              <span className="text-[9px] font-semibold text-slate-500">Pimpim · sekarang</span>
            </div>
            <div className="text-[12px] font-bold text-slate-900 leading-snug break-words">{title.trim() || 'Judul notifikasi'}</div>
            <div className="text-[11px] text-slate-600 mt-0.5 leading-snug break-words line-clamp-4">
              {body.trim() || 'Isi pesan akan tampil seperti ini di layar pengguna.'}
            </div>
          </div>
          <div className="mt-2 bg-white/40 rounded-2xl h-9" />
        </div>
      </div>

      <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
        Ikon, nama aplikasi, dan suara mengikuti pengaturan aplikasi di HP.
        <br />
        Pesan panjang dipotong di layar kunci.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman                                                               */
/* ------------------------------------------------------------------ */

export default function NotifikasiPage() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const notify = useCallback((type: ToastState['type'], message: string) => setToast({ type, message }), []);
  const closeToast = useCallback(() => setToast(null), []);

  // Ringkasan
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<Pick<Broadcast, 'created_at' | 'status' | 'recipients'>[]>([]);

  // Form siaran
  const [target, setTarget] = useState<Target>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const composeRef = useRef<HTMLDivElement | null>(null);

  // Riwayat
  const [rows, setRows] = useState<Broadcast[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [histLoading, setHistLoading] = useState(true);
  const [histError, setHistError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [fTarget, setFTarget] = useState<'all' | Target>('all');
  const [fStatus, setFStatus] = useState<'all' | BroadcastStatus>('all');
  const [fRange, setFRange] = useState<'7' | '30' | '90' | 'all'>('30');
  const [detail, setDetail] = useState<Broadcast | null>(null);
  const [exporting, setExporting] = useState(false);

  /* ----- pencarian dengan jeda ----- */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  /* ----- hitung mundur setelah kirim ----- */
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /* ----- muat ringkasan ----- */
  const loadSummary = useCallback(async () => {
    const { count } = await supabase.from('user_push_tokens').select('*', { count: 'exact', head: true });
    if (count !== null) setDeviceCount(count);

    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabase
      .from('push_broadcasts')
      .select('created_at,status,recipients')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000);
    setRecent((data || []) as Pick<Broadcast, 'created_at' | 'status' | 'recipients'>[]);
  }, []);

  /* ----- muat riwayat (dipakai juga untuk ekspor) ----- */
  const queryHistory = useCallback(
    (from: number, to: number) => {
      let query = supabase
        .from('push_broadcasts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
      if (fTarget !== 'all') query = query.eq('target', fTarget);
      if (fStatus !== 'all') query = query.eq('status', fStatus);
      if (fRange !== 'all') {
        query = query.gte('created_at', new Date(Date.now() - Number(fRange) * 86400000).toISOString());
      }
      if (debouncedSearch) {
        const q = debouncedSearch.replace(/[,()%*]/g, ' ');
        query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
      }
      return query.range(from, to);
    },
    [fTarget, fStatus, fRange, debouncedSearch]
  );

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    const { data, error, count } = await queryHistory(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      setHistError(
        error.message?.includes('push_broadcasts')
          ? 'Tabel riwayat belum ada. Jalankan SQL Part CI di Supabase terlebih dahulu.'
          : error.message || 'Gagal memuat riwayat.'
      );
      setRows([]);
      setTotal(0);
    } else {
      setHistError('');
      setRows((data || []) as Broadcast[]);
      setTotal(count ?? 0);
    }
    setHistLoading(false);
  }, [queryHistory, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  // Kembali ke halaman 1 saat filter berubah
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [fTarget, fStatus, fRange, debouncedSearch]);

  /* ----- turunan ----- */
  const stats = useMemo(() => {
    const sent = recent.filter((r) => r.status === 'sent');
    return {
      count30: sent.length,
      recipients30: sent.reduce((a, r) => a + (r.recipients || 0), 0),
      last: recent[0],
    };
  }, [recent]);

  const titleOk = title.trim().length >= 3 && title.trim().length <= TITLE_MAX;
  const bodyOk = body.trim().length >= 3 && body.trim().length <= BODY_MAX;
  const canSend = titleOk && bodyOk && !sending && cooldown === 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const targetMeta = TARGETS.find((t) => t.key === target)!;

  /* ----- kirim ----- */
  const doSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.rpc('admin_broadcast_push_logged', {
        p_target: target,
        p_title: title.trim(),
        p_body: body.trim(),
      });
      if (error) {
        const missing = error.code === 'PGRST202' || error.message?.includes('admin_broadcast_push_logged');
        throw new Error(
          missing ? 'Fungsi pencatat siaran belum terpasang. Jalankan SQL Part CI di Supabase terlebih dahulu.' : error.message
        );
      }
      const res = data as { success?: boolean; message?: string; count?: number } | null;
      if (!res?.success) {
        notify('error', res?.message || 'Siaran gagal dikirim.');
      } else {
        notify('success', `Siaran dikirim ke ${res.count ?? 0} perangkat.`);
        setTitle('');
        setBody('');
        setCooldown(COOLDOWN_SECONDS);
      }
    } catch (err: unknown) {
      notify('error', errMsg(err, 'Terjadi kendala saat menyiarkan notifikasi.'));
    } finally {
      setSending(false);
      setConfirmOpen(false);
      setPage(0);
      loadHistory();
      loadSummary();
    }
  };

  /* ----- pakai ulang dari riwayat ----- */
  const reuse = (b: Broadcast) => {
    setTarget(b.target);
    setTitle(b.title);
    setBody(b.body);
    setDetail(null);
    composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ----- ekspor CSV ----- */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data, error } = await queryHistory(0, 999);
      if (error) throw error;
      const list = (data || []) as Broadcast[];
      const header = ['Waktu', 'Judul', 'Isi', 'Target', 'Penerima', 'Status', 'Pengirim', 'Catatan'];
      const lines = list.map((r) =>
        [
          fmtDateTime(r.created_at),
          r.title,
          r.body,
          TARGET_LABEL[r.target] || r.target,
          r.recipients,
          r.status === 'sent' ? 'Terkirim' : 'Gagal',
          r.actor_email,
          r.message,
        ]
          .map(csvCell)
          .join(',')
      );
      const csv = '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `riwayat-siaran-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      notify('success', `${list.length} baris riwayat diekspor.`);
    } catch (err: unknown) {
      notify('error', errMsg(err, 'Gagal mengekspor riwayat.'));
    } finally {
      setExporting(false);
    }
  };

  /* ----- tampilan ----- */
  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Notifikasi</h2>
        <p className="text-sm text-slate-500 mt-1">
          Kirim siaran push ke HP pengguna dan pantau riwayat pengirimannya
        </p>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Smartphone className="w-4 h-4" />}
          label="Perangkat terdaftar"
          value={deviceCount === null ? '-' : deviceCount}
          hint="Bisa menerima notifikasi"
          tone="blue"
        />
        <StatCard
          icon={<Radio className="w-4 h-4" />}
          label="Siaran 30 hari"
          value={stats.count30}
          hint="Yang berhasil terkirim"
          tone="green"
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Total penerima 30 hari"
          value={stats.recipients30.toLocaleString('id-ID')}
          hint="Dijumlah dari semua siaran"
          tone="violet"
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Siaran terakhir"
          value={stats.last ? timeAgo(stats.last.created_at) : '-'}
          hint={stats.last ? (stats.last.status === 'sent' ? 'Berhasil' : 'Gagal') : 'Belum ada siaran'}
          tone="slate"
        />
      </div>

      {/* Buat siaran */}
      <div ref={composeRef} className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start scroll-mt-4">
        <div className="lg:col-span-2 bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)] p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#2f7088]" />
              Buat Siaran Baru
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pesan langsung muncul di panel notifikasi HP pengguna secara serentak dan tidak bisa ditarik kembali.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) setConfirmOpen(true);
            }}
            className="space-y-4 text-xs"
          >
            <div>
              <label className="font-semibold text-slate-700 block mb-1.5">Target pengguna</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TARGETS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTarget(t.key)}
                    className={`text-left py-2.5 px-3 rounded-lg border transition-all ${
                      target === t.key
                        ? 'bg-[#e8f0f7] border-[#4a98ad] text-[#245a70]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold">
                      {t.label}
                      {t.key === 'all' && deviceCount !== null ? ` (${deviceCount})` : ''}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${target === t.key ? 'text-[#4a98ad]' : 'text-slate-400'}`}>{t.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1.5">Mulai dari templat</label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => {
                      setTitle(t.title);
                      setBody(t.body);
                    }}
                    className="px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 hover:bg-[#e8f0f7] hover:border-[#8dbccd] hover:text-[#245a70] transition-colors"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 flex justify-between mb-1">
                <span>Judul notifikasi *</span>
                <span className={title.length > TITLE_MAX ? 'text-rose-600 font-bold' : 'text-slate-400 font-normal'}>
                  {title.length}/{TITLE_MAX}
                </span>
              </label>
              <input
                type="text"
                maxLength={TITLE_MAX}
                placeholder="Contoh: Promo Spesial Kost Dekat Unpad"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-[#4a98ad] font-medium"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 flex justify-between mb-1">
                <span>Isi pesan singkat *</span>
                <span className={body.length > BODY_MAX ? 'text-rose-600 font-bold' : 'text-slate-400 font-normal'}>
                  {body.length}/{BODY_MAX}
                </span>
              </label>
              <textarea
                rows={4}
                maxLength={BODY_MAX}
                placeholder="Contoh: Dapatkan diskon sewa bulan pertama untuk 5 kosan pilihan di Jatinangor hari ini..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-[#4a98ad] leading-relaxed"
              />
              <p className="text-[11px] text-slate-400 mt-1">Tulis pendek dan jelas. Di layar kunci, pesan panjang akan terpotong.</p>
            </div>

            <div className="pt-1 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                {cooldown > 0 ? `Tunggu ${cooldown} detik sebelum siaran berikutnya.` : 'Kamu akan diminta konfirmasi sebelum terkirim.'}
              </span>
              <button type="submit" disabled={!canSend} className={BTN_PRIMARY}>
                <Send className="w-4 h-4" />
                Tinjau & Siarkan
              </button>
            </div>
          </form>
        </div>

        <PhonePreview title={title} body={body} />
      </div>

      {/* Riwayat */}
      <div className="bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-[#2f7088]" /> Riwayat Siaran
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {total.toLocaleString('id-ID')} siaran sesuai filter. Dicatat otomatis oleh sistem dan tidak bisa diubah dari sini.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={loadHistory} className={BTN_GHOST} title="Muat ulang">
                <RefreshCw className={`w-3.5 h-3.5 ${histLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={exportCsv} disabled={exporting || total === 0} className={BTN_GHOST}>
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Ekspor CSV
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul atau isi..."
                className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs w-56 focus:outline-[#4a98ad]"
              />
            </div>
            <select
              value={fTarget}
              onChange={(e) => setFTarget(e.target.value as 'all' | Target)}
              className="px-3 py-2 border border-slate-200 rounded-full text-xs font-semibold text-slate-700 bg-white/80"
            >
              <option value="all">Semua target</option>
              {TARGETS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value as 'all' | BroadcastStatus)}
              className="px-3 py-2 border border-slate-200 rounded-full text-xs font-semibold text-slate-700 bg-white/80"
            >
              <option value="all">Semua status</option>
              <option value="sent">Terkirim</option>
              <option value="failed">Gagal</option>
            </select>
            <select
              value={fRange}
              onChange={(e) => setFRange(e.target.value as '7' | '30' | '90' | 'all')}
              className="px-3 py-2 border border-slate-200 rounded-full text-xs font-semibold text-slate-700 bg-white/80"
            >
              <option value="7">7 hari terakhir</option>
              <option value="30">30 hari terakhir</option>
              <option value="90">90 hari terakhir</option>
              <option value="all">Semua waktu</option>
            </select>
          </div>
        </div>

        {histError ? (
          <div className="p-10 text-center text-xs text-rose-600">{histError}</div>
        ) : histLoading && rows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-[#4a98ad]" /> Memuat riwayat...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">Belum ada siaran yang cocok dengan filter ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5 w-40">Waktu</th>
                  <th className="text-left font-semibold px-4 py-2.5">Pesan</th>
                  <th className="text-left font-semibold px-4 py-2.5 w-40">Target</th>
                  <th className="text-right font-semibold px-4 py-2.5 w-24">Penerima</th>
                  <th className="text-left font-semibold px-4 py-2.5 w-28">Status</th>
                  <th className="text-left font-semibold px-4 py-2.5 w-44">Pengirim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setDetail(r)} className="hover:bg-[#e8f0f7]/40 cursor-pointer">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                      <div className="text-[10px] text-slate-400">{timeAgo(r.created_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800 truncate max-w-md">{r.title}</div>
                      <div className="text-slate-500 truncate max-w-md">{r.body}</div>
                    </td>
                    <td className="px-4 py-3">
                      <TargetBadge target={r.target} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700">{r.recipients.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[11rem]">{r.actor_email || 'sistem'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!histError && total > PAGE_SIZE && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Halaman {page + 1} dari {totalPages}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || histLoading} className={BTN_GHOST}>
                <ChevronLeft className="w-3.5 h-3.5" /> Sebelumnya
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || histLoading}
                className={BTN_GHOST}
              >
                Berikutnya <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Konfirmasi kirim */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Tinjau sebelum menyiarkan</h3>
              <button onClick={() => !sending && setConfirmOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Akan dikirim ke <b>{target === 'all' && deviceCount !== null ? `${deviceCount} perangkat` : targetMeta.label}</b>{' '}
                  sekarang juga. Notifikasi yang sudah terkirim tidak bisa ditarik kembali.
                </span>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Target</div>
                <div className="font-bold text-slate-800 mt-0.5">{targetMeta.label}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Judul</div>
                <div className="font-bold text-slate-800 mt-0.5 break-words">{title.trim()}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Isi pesan</div>
                <div className="text-slate-700 mt-0.5 leading-relaxed break-words">{body.trim()}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setConfirmOpen(false)} disabled={sending} className={BTN_GHOST}>
                Kembali
              </button>
              <button onClick={doSend} disabled={sending} className={BTN_PRIMARY}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Ya, siarkan sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail riwayat */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Detail siaran</h3>
              <button onClick={() => setDetail(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <StatusBadge status={detail.status} />
                <TargetBadge target={detail.target} />
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Judul</div>
                <div className="font-bold text-slate-800 mt-0.5 break-words">{detail.title}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Isi pesan</div>
                <div className="text-slate-700 mt-0.5 leading-relaxed break-words">{detail.body}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Penerima</div>
                  <div className="font-bold text-slate-800 mt-0.5">{detail.recipients.toLocaleString('id-ID')} perangkat</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Dikirim oleh</div>
                  <div className="text-slate-700 mt-0.5 break-all">{detail.actor_email || 'sistem'}</div>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-semibold">Waktu</div>
                <div className="text-slate-700 mt-0.5">{fmtDateTime(detail.created_at)}</div>
              </div>
              {detail.status === 'failed' && detail.message && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 leading-relaxed break-words">
                  <b>Penyebab gagal:</b> {detail.message}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setDetail(null)} className={BTN_GHOST}>
                Tutup
              </button>
              <button onClick={() => reuse(detail)} className={BTN_PRIMARY}>
                <Copy className="w-4 h-4" />
                Pakai lagi
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}