'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Upload,
  X,
  Eye,
  Layers,
  Search,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  Pencil,
  Copy,
  History,
  Smartphone,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Tipe data                                                           */
/* ------------------------------------------------------------------ */

interface Banner {
  id: string;
  title: string;
  description: string;
  tag: string;
  tag_bg: string;
  order_index: number;
  is_active: boolean;
  image_url: string;
  created_at: string;
}

interface BannerAudit {
  id: number;
  created_at: string;
  banner_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_row: Partial<Banner> | null;
  new_row: Partial<Banner> | null;
  actor_email: string | null;
}

type StatusFilter = 'all' | 'active' | 'inactive';
type ViewMode = 'grid' | 'list';
type PageTab = 'banners' | 'history';
type AuditFilter = 'all' | 'INSERT' | 'UPDATE' | 'DELETE';

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

interface BannerForm {
  title: string;
  description: string;
  tag: string;
  tagBg: string;
  order: string;
  imageUrl: string;
  isActive: boolean;
}

/* ------------------------------------------------------------------ */
/* Gaya & pembantu                                                     */
/* ------------------------------------------------------------------ */

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-full bg-gradient-to-b from-[#4a98ad] to-[#2f7088] text-white shadow-md hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] hover:bg-white transition disabled:opacity-50';
const ICON_BTN =
  'p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const AUDIT_PAGE_SIZE = 15;

const FIELD_LABELS: Record<string, string> = {
  title: 'Judul',
  description: 'Keterangan',
  tag: 'Label',
  tag_bg: 'Warna badge',
  order_index: 'Urutan',
  is_active: 'Status',
  image_url: 'Gambar',
};

const EMPTY_FORM: BannerForm = {
  title: '',
  description: '',
  tag: 'PROMO',
  tagBg: '#0284C7',
  order: '1',
  imageUrl: '',
  isActive: true,
};

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

function fieldValue(key: string, v: unknown): string {
  if (key === 'is_active') return v ? 'Tayang' : 'Nonaktif';
  if (key === 'image_url') return 'gambar';
  if (v === null || v === undefined || v === '') return '(kosong)';
  return String(v);
}

function diffRows(
  oldRow: Partial<Banner> | null,
  newRow: Partial<Banner> | null
): { label: string; from: string; to: string }[] {
  if (!oldRow || !newRow) return [];
  const out: { label: string; from: string; to: string }[] = [];
  (Object.keys(FIELD_LABELS) as (keyof Banner)[]).forEach((k) => {
    if (oldRow[k] !== newRow[k]) {
      out.push({
        label: FIELD_LABELS[k],
        from: fieldValue(k, oldRow[k]),
        to: k === 'image_url' ? 'diganti' : fieldValue(k, newRow[k]),
      });
    }
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Komponen kecil                                                      */
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
  tone: 'blue' | 'green' | 'rose' | 'slate';
}) {
  const hero = tone === 'blue';
  const bg: Record<string, string> = {
    blue: 'from-[#4a98ad] to-[#2f7088]',
    green: 'from-[#c6ebe1] to-[#98d4c9]',
    rose: 'from-[#f7d9de] to-[#ebb0ba]',
    violet: 'from-[#e8f0f7] to-[#cfdeea]',
    slate: 'from-[#e8f0f7] to-[#cfdeea]',
  };
  const color = hero ? 'text-white' : tone === 'green' ? 'text-emerald-900' : tone === 'rose' ? 'text-rose-900' : 'text-slate-800';
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

function StatusPill({ active, onClick, disabled }: { active: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={active ? 'Klik untuk menonaktifkan' : 'Klik untuk menayangkan'}
      className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase transition-colors disabled:opacity-50 ${
        active
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
          : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
      }`}
    >
      {active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {active ? 'Tayang' : 'Nonaktif'}
    </button>
  );
}

function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      <div
        className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold text-white ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}
      >
        {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        {toast.message}
        <button onClick={onClose} className="ml-2 opacity-80 hover:opacity-100">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Pratinjau slider banner seperti tampil di beranda aplikasi */
function PhonePreview({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const safeIndex = banners.length === 0 ? 0 : Math.min(index, banners.length - 1);
  const current = banners[safeIndex];

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % banners.length), 3500);
    return () => clearInterval(t);
  }, [banners.length]);

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col items-center">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">
        <Smartphone className="w-3.5 h-3.5" /> Pratinjau di Aplikasi
      </span>

      <div className="w-[230px] rounded-[28px] border-[6px] border-slate-800 bg-white shadow-xl overflow-hidden">
        <div className="h-5 bg-slate-800 flex justify-center">
          <div className="w-14 h-3 bg-slate-950 rounded-b-xl" />
        </div>
        <div className="px-3 pt-3 pb-4 bg-slate-50 min-h-[300px]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[9px] text-slate-400">Halo,</div>
              <div className="text-[11px] font-extrabold text-slate-800">Mau ke mana hari ini?</div>
            </div>
            <div className="w-6 h-6 rounded-full bg-[#2f7088] text-white text-[10px] font-bold flex items-center justify-center">P</div>
          </div>

          {current ? (
            <div className="relative aspect-[16/8] rounded-xl overflow-hidden bg-slate-200 shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.image_url} alt={current.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span
                className="absolute top-1.5 left-1.5 text-white text-[8px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: current.tag_bg || '#0284C7' }}
              >
                {current.tag}
              </span>
              <div className="absolute bottom-1.5 left-2 right-2">
                <div className="text-white text-[10px] font-extrabold leading-tight line-clamp-1">{current.title}</div>
                <div className="text-white/80 text-[8px] leading-tight line-clamp-1">{current.description}</div>
              </div>
            </div>
          ) : (
            <div className="aspect-[16/8] rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 text-center px-4">
              Belum ada banner tayang
            </div>
          )}

          {banners.length > 1 && (
            <div className="flex justify-center gap-1 mt-2">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => setIndex(i)}
                  aria-label={`Banner ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${i === safeIndex ? 'w-4 bg-[#2f7088]' : 'w-1.5 bg-slate-300'}`}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {['Ride', 'Hunian', 'Tolongin', 'Laundry'].map((m) => (
              <div key={m} className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 shadow-sm" />
                <span className="text-[8px] text-slate-500">{m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
        Hanya banner berstatus <b>Tayang</b>, berurutan sesuai Nomor Urut.
        <br />
        Pratinjau perkiraan — tampilan asli mengikuti aplikasi.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halaman                                                              */
/* ------------------------------------------------------------------ */

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<PageTab>('banners');
  const [toast, setToast] = useState<ToastState | null>(null);

  // Cari & saring
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<ViewMode>('grid');

  // Aksi per baris
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);

  // Modal tambah / ubah
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  // Riwayat perubahan
  const [audit, setAudit] = useState<BannerAudit[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all');
  const [auditSearch, setAuditSearch] = useState('');

  const notify = useCallback((type: ToastState['type'], message: string) => setToast({ type, message }), []);
  const closeToast = useCallback(() => setToast(null), []);

  /* ----- muat data ----- */

  const loadBanners = useCallback(async () => {
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('order_index', { ascending: true });
    if (error) {
      setLoadError(error.message || 'Gagal memuat banner.');
    } else {
      setLoadError('');
      setBanners((data || []) as Banner[]);
    }
    setLoading(false);
  }, []);

  const loadAudit = useCallback(async (offset: number) => {
    setAuditLoading(true);
    const { data, error, count } = await supabase
      .from('banner_audit')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + AUDIT_PAGE_SIZE - 1);
    if (error) {
      setAuditError(
        error.message?.includes('banner_audit')
          ? 'Tabel riwayat belum ada. Jalankan SQL Part CI di Supabase terlebih dahulu.'
          : error.message || 'Gagal memuat riwayat.'
      );
    } else {
      setAuditError('');
      setAudit((prev) => (offset === 0 ? ((data || []) as BannerAudit[]) : [...prev, ...((data || []) as BannerAudit[])]));
      setAuditTotal(count ?? 0);
    }
    setAuditLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBanners();
    loadAudit(0);
  }, [loadBanners, loadAudit]);

  /* ----- turunan ----- */

  const sorted = useMemo(
    () => [...banners].sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at)),
    [banners]
  );
  const activeCount = banners.filter((b) => b.is_active).length;
  const inactiveCount = banners.length - activeCount;
  const filtersActive = search.trim() !== '' || statusFilter !== 'all';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((b) => {
      if (statusFilter === 'active' && !b.is_active) return false;
      if (statusFilter === 'inactive' && b.is_active) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q) ||
        (b.tag || '').toLowerCase().includes(q)
      );
    });
  }, [sorted, search, statusFilter]);

  const previewBanners = useMemo(() => sorted.filter((b) => b.is_active), [sorted]);

  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return audit.filter((a) => {
      if (auditFilter !== 'all' && a.action !== auditFilter) return false;
      if (!q) return true;
      const title = (a.new_row?.title || a.old_row?.title || '').toLowerCase();
      return title.includes(q) || (a.actor_email || '').toLowerCase().includes(q);
    });
  }, [audit, auditFilter, auditSearch]);

  const lastChange = audit[0];

  /* ----- form tambah / ubah ----- */

  const openNew = () => {
    const nextOrder = banners.length ? Math.max(...banners.map((b) => b.order_index)) + 1 : 1;
    setEditingId(null);
    setForm({ ...EMPTY_FORM, order: String(nextOrder) });
    setModalOpen(true);
  };

  const openEdit = (b: Banner) => {
    setEditingId(b.id);
    setForm({
      title: b.title,
      description: b.description || '',
      tag: b.tag || 'PROMO',
      tagBg: b.tag_bg || '#0284C7',
      order: String(b.order_index),
      imageUrl: b.image_url,
      isActive: b.is_active,
    });
    setModalOpen(true);
  };

  const setField = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      notify('error', 'File harus berupa gambar (JPG, PNG, atau WebP).');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      notify('error', `Ukuran banner maksimal 2 MB (file ini ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      return;
    }

    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `banners/banner_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('kamar-kita')
        .upload(filePath, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('kamar-kita').getPublicUrl(filePath);
      if (urlData?.publicUrl) setField('imageUrl', urlData.publicUrl);
    } catch (err: unknown) {
      notify('error', errMsg(err, 'Gagal mengunggah foto.'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 3) {
      notify('error', 'Judul banner minimal 3 huruf.');
      return;
    }
    if (!form.imageUrl.trim()) {
      notify('error', 'Gambar banner wajib diunggah.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        tag: form.tag.trim().toUpperCase() || 'PROMO',
        tag_bg: form.tagBg,
        order_index: parseInt(form.order, 10) || 1,
        image_url: form.imageUrl.trim(),
        is_active: form.isActive,
      };

      if (editingId) {
        const { error } = await supabase.from('banners').update(payload).eq('id', editingId);
        if (error) throw error;
        notify('success', 'Perubahan banner disimpan.');
      } else {
        const { error } = await supabase.from('banners').insert([payload]);
        if (error) throw error;
        notify('success', payload.is_active ? 'Banner baru ditayangkan.' : 'Banner disimpan sebagai nonaktif.');
      }

      setModalOpen(false);
      await Promise.all([loadBanners(), loadAudit(0)]);
    } catch (err: unknown) {
      notify('error', errMsg(err, 'Gagal menyimpan banner.'));
    } finally {
      setSaving(false);
    }
  };

  /* ----- aksi baris ----- */

  const toggleStatus = async (b: Banner) => {
    setBusyId(b.id);
    const { error } = await supabase.from('banners').update({ is_active: !b.is_active }).eq('id', b.id);
    if (error) {
      notify('error', errMsg(error, 'Gagal mengubah status.'));
    } else {
      setBanners((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: !b.is_active } : x)));
      notify('success', !b.is_active ? 'Banner ditayangkan.' : 'Banner dinonaktifkan.');
      loadAudit(0);
    }
    setBusyId(null);
  };

  const duplicate = async (b: Banner) => {
    setBusyId(b.id);
    const nextOrder = Math.max(...banners.map((x) => x.order_index), 0) + 1;
    const { error } = await supabase.from('banners').insert([
      {
        title: `${b.title} (salinan)`,
        description: b.description,
        tag: b.tag,
        tag_bg: b.tag_bg,
        order_index: nextOrder,
        image_url: b.image_url,
        is_active: false,
      },
    ]);
    if (error) {
      notify('error', errMsg(error, 'Gagal menggandakan banner.'));
    } else {
      notify('success', 'Salinan dibuat sebagai nonaktif.');
      await Promise.all([loadBanners(), loadAudit(0)]);
    }
    setBusyId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const { error } = await supabase.from('banners').delete().eq('id', deleteTarget.id);
    if (error) {
      notify('error', errMsg(error, 'Gagal menghapus banner.'));
    } else {
      setBanners((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      notify('success', 'Banner dihapus. Tercatat di Riwayat.');
      loadAudit(0);
    }
    setBusyId(null);
    setDeleteTarget(null);
  };

  /** Geser banner satu posisi; semua nomor urut dirapikan jadi 1, 2, 3, ... */
  const move = async (b: Banner, dir: -1 | 1) => {
    const pos = sorted.findIndex((x) => x.id === b.id);
    const target = pos + dir;
    if (pos < 0 || target < 0 || target >= sorted.length) return;

    const next = [...sorted];
    [next[pos], next[target]] = [next[target], next[pos]];
    const changes = next
      .map((x, i) => ({ id: x.id, order: i + 1, old: x.order_index }))
      .filter((x) => x.order !== x.old);

    setBusyId(b.id);
    try {
      const results = await Promise.all(
        changes.map((c) => supabase.from('banners').update({ order_index: c.order }).eq('id', c.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      notify('success', 'Urutan banner diperbarui.');
    } catch (err: unknown) {
      notify('error', errMsg(err, 'Gagal mengubah urutan.'));
    }
    await Promise.all([loadBanners(), loadAudit(0)]);
    setBusyId(null);
  };

  /* ----- tampilan ----- */

  const canReorder = !filtersActive;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Banner Promo</h2>
          <p className="text-sm text-slate-500 mt-1">
            Atur slider promo di beranda aplikasi: tayang, urutan, dan riwayat perubahannya
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold border border-slate-200">
            <button
              onClick={() => setTab('banners')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                tab === 'banners' ? 'bg-white text-[#2f7088] shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Banner ({banners.length})
            </button>
            <button
              onClick={() => setTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                tab === 'history' ? 'bg-white text-[#2f7088] shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Riwayat
            </button>
          </div>
          <button onClick={openNew} className={BTN_PRIMARY}>
            <Plus className="w-4 h-4" />
            Tambah Banner
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Layers className="w-4 h-4" />} label="Total banner" value={banners.length} hint="Semua yang tersimpan" tone="blue" />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Sedang tayang" value={activeCount} hint="Terlihat di aplikasi" tone="green" />
        <StatCard icon={<XCircle className="w-4 h-4" />} label="Nonaktif" value={inactiveCount} hint="Disimpan, belum tayang" tone="rose" />
        <StatCard
          icon={<History className="w-4 h-4" />}
          label="Perubahan terakhir"
          value={lastChange ? timeAgo(lastChange.created_at) : '-'}
          hint={lastChange?.actor_email || 'Belum ada catatan'}
          tone="slate"
        />
      </div>

      {/* ============ TAB BANNER ============ */}
      {tab === 'banners' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-4">
            {/* Toolbar */}
            <div className="bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)] p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari judul, keterangan, atau label..."
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-[#4a98ad]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="px-3 py-2 border border-slate-200 rounded-full text-xs font-semibold text-slate-700 bg-white/80 focus:outline-[#4a98ad]"
              >
                <option value="all">Semua status</option>
                <option value="active">Tayang</option>
                <option value="inactive">Nonaktif</option>
              </select>
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setView('grid')}
                  title="Tampilan kartu"
                  className={`p-1.5 rounded-md ${view === 'grid' ? 'bg-white text-[#2f7088] shadow-sm' : 'text-slate-500'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setView('list')}
                  title="Tampilan daftar"
                  className={`p-1.5 rounded-md ${view === 'list' ? 'bg-white text-[#2f7088] shadow-sm' : 'text-slate-500'}`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {filtersActive && (
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                Menampilkan {filtered.length} dari {banners.length} banner. Pengurutan dimatikan saat ada filter.
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                  className="text-[#2f7088] font-bold hover:underline"
                >
                  Hapus filter
                </button>
              </div>
            )}

            {/* Daftar */}
            {loading ? (
              <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-[#4a98ad]" /> Memuat banner promo...
              </div>
            ) : loadError ? (
              <div className="py-10 text-center bg-white rounded-xl border border-rose-200 text-xs text-rose-600 space-y-3">
                <div>{loadError}</div>
                <button onClick={loadBanners} className={`${BTN_GHOST} mx-auto`}>
                  <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
                {banners.length === 0 ? 'Belum ada banner promo. Klik "Tambah Banner" untuk membuat yang pertama.' : 'Tidak ada banner yang cocok dengan pencarian.'}
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((b) => {
                  const pos = sorted.findIndex((x) => x.id === b.id);
                  return (
                    <div
                      key={b.id}
                      className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col ${
                        b.is_active ? 'border-slate-200' : 'border-slate-200 opacity-80'
                      }`}
                    >
                      <div className="relative aspect-[16/8] bg-slate-100 border-b border-slate-100 overflow-hidden group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={b.image_url}
                          alt={b.title}
                          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                            b.is_active ? '' : 'grayscale'
                          }`}
                        />
                        <span
                          className="absolute top-2.5 left-2.5 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow"
                          style={{ backgroundColor: b.tag_bg || '#0284C7' }}
                        >
                          {b.tag}
                        </span>
                        <span className="absolute top-2.5 right-2.5 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">
                          Urut #{b.order_index}
                        </span>
                      </div>

                      <div className="p-3.5 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm leading-snug">{b.title}</h4>
                          <p className="text-slate-500 text-xs mt-1 line-clamp-2">
                            {b.description || 'Tidak ada keterangan tambahan.'}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-2">Dibuat {fmtDateTime(b.created_at)}</p>
                        </div>

                        <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                          <StatusPill active={b.is_active} onClick={() => toggleStatus(b)} disabled={busyId === b.id} />
                          <div className="flex items-center">
                            <button
                              onClick={() => move(b, -1)}
                              disabled={!canReorder || busyId !== null || pos <= 0}
                              className={ICON_BTN}
                              title="Naikkan urutan"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => move(b, 1)}
                              disabled={!canReorder || busyId !== null || pos >= sorted.length - 1}
                              className={ICON_BTN}
                              title="Turunkan urutan"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => openEdit(b)} className={ICON_BTN} title="Ubah banner">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => duplicate(b)} disabled={busyId !== null} className={ICON_BTN} title="Gandakan">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <a href={b.image_url} target="_blank" rel="noreferrer" className={ICON_BTN} title="Lihat gambar penuh">
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                            <button
                              onClick={() => setDeleteTarget(b)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Hapus banner"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)] overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2.5 w-14">Urut</th>
                      <th className="text-left font-semibold px-3 py-2.5">Banner</th>
                      <th className="text-left font-semibold px-3 py-2.5 w-28">Status</th>
                      <th className="text-right font-semibold px-3 py-2.5 w-44">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((b) => {
                      const pos = sorted.findIndex((x) => x.id === b.id);
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2.5 font-bold text-slate-500">#{b.order_index}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={b.image_url} alt="" className="w-20 aspect-[16/8] object-cover rounded-md border border-slate-200 bg-slate-100" />
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 truncate">{b.title}</div>
                                <div className="text-slate-500 truncate">{b.description || 'Tidak ada keterangan.'}</div>
                                <span
                                  className="inline-block mt-1 text-white text-[9px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: b.tag_bg || '#0284C7' }}
                                >
                                  {b.tag}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusPill active={b.is_active} onClick={() => toggleStatus(b)} disabled={busyId === b.id} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end">
                              <button onClick={() => move(b, -1)} disabled={!canReorder || busyId !== null || pos <= 0} className={ICON_BTN} title="Naikkan">
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => move(b, 1)} disabled={!canReorder || busyId !== null || pos >= sorted.length - 1} className={ICON_BTN} title="Turunkan">
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => openEdit(b)} className={ICON_BTN} title="Ubah">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => duplicate(b)} disabled={busyId !== null} className={ICON_BTN} title="Gandakan">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteTarget(b)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Hapus">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Urutan slider mengikuti <b>Nomor Urut</b>. Format foto ideal <b>16:9 atau 2:1</b>, maksimal 2 MB. Banner nonaktif tidak tampil di aplikasi.
            </p>
          </div>

          <div className="lg:sticky lg:top-4">
            <PhonePreview banners={previewBanners} />
          </div>
        </div>
      )}

      {/* ============ TAB RIWAYAT ============ */}
      {tab === 'history' && (
        <div className="bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-[#2f7088]" /> Riwayat Perubahan Banner
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Dicatat otomatis oleh sistem setiap banner dibuat, diubah, atau dihapus. Tidak bisa diedit dari sini.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Cari judul atau pengubah..."
                  className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs w-52 focus:outline-[#4a98ad]"
                />
              </div>
              <select
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value as AuditFilter)}
                className="px-3 py-2 border border-slate-200 rounded-full text-xs font-semibold text-slate-700 bg-white/80"
              >
                <option value="all">Semua aksi</option>
                <option value="INSERT">Dibuat</option>
                <option value="UPDATE">Diubah</option>
                <option value="DELETE">Dihapus</option>
              </select>
            </div>
          </div>

          {auditError ? (
            <div className="p-8 text-center text-xs text-rose-600">{auditError}</div>
          ) : filteredAudit.length === 0 && !auditLoading ? (
            <div className="p-10 text-center text-xs text-slate-400">Belum ada catatan perubahan.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredAudit.map((a) => {
                const row = a.new_row || a.old_row;
                const changes = a.action === 'UPDATE' ? diffRows(a.old_row, a.new_row) : [];
                const badge =
                  a.action === 'INSERT'
                    ? { text: 'Dibuat', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                    : a.action === 'UPDATE'
                    ? { text: 'Diubah', cls: 'bg-[#e8f0f7] text-[#245a70] border-[#b5d3df]' }
                    : { text: 'Dihapus', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
                return (
                  <li key={a.id} className="p-4 flex gap-3">
                    {row?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.image_url} alt="" className="w-20 aspect-[16/8] object-cover rounded-md border border-slate-200 bg-slate-100 shrink-0 self-start" />
                    ) : (
                      <div className="w-20 aspect-[16/8] rounded-md bg-slate-100 shrink-0 self-start" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.text}</span>
                        <span className="text-xs font-bold text-slate-800 truncate">{row?.title || '(tanpa judul)'}</span>
                      </div>
                      {changes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {changes.map((c) => (
                            <li key={c.label} className="text-[11px] text-slate-600">
                              <span className="font-semibold">{c.label}:</span>{' '}
                              <span className="text-slate-400 line-through">{c.from}</span> → <span className="font-semibold text-slate-800">{c.to}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="text-[11px] text-slate-400 mt-1.5">
                        {fmtDateTime(a.created_at)} · oleh {a.actor_email || 'sistem'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!auditError && audit.length < auditTotal && (
            <div className="p-3 border-t border-slate-100 flex justify-center">
              <button onClick={() => loadAudit(audit.length)} disabled={auditLoading} className={BTN_GHOST}>
                {auditLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Muat lebih banyak ({audit.length} dari {auditTotal})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============ MODAL TAMBAH / UBAH ============ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">{editingId ? 'Ubah Banner Promo' : 'Tambah Banner Promo Baru'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-5 p-5 text-xs">
                <div className="md:col-span-3 space-y-4">
                  <div>
                    <label className="font-semibold text-slate-700 flex justify-between mb-1">
                      <span>Judul Banner *</span>
                      <span className="text-slate-400 font-normal">{form.title.length}/60</span>
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      required
                      placeholder="Contoh: Diskon Sewa Awal Semester"
                      value={form.title}
                      onChange={(e) => setField('title', e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-xl focus:outline-[#4a98ad]"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 flex justify-between mb-1">
                      <span>Keterangan Singkat</span>
                      <span className="text-slate-400 font-normal">{form.description.length}/90</span>
                    </label>
                    <textarea
                      rows={2}
                      maxLength={90}
                      placeholder="Contoh: Khusus kost putri area Caringin & Sayang"
                      value={form.description}
                      onChange={(e) => setField('description', e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-xl focus:outline-[#4a98ad]"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Label</label>
                      <input
                        type="text"
                        maxLength={12}
                        placeholder="PROMO"
                        value={form.tag}
                        onChange={(e) => setField('tag', e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-xl focus:outline-[#4a98ad] font-bold uppercase"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Warna Badge</label>
                      <div className="flex items-center gap-2 border border-slate-200 rounded-xl p-1.5">
                        <input
                          type="color"
                          value={form.tagBg}
                          onChange={(e) => setField('tagBg', e.target.value)}
                          className="w-6 h-6 border-0 p-0 rounded cursor-pointer"
                        />
                        <span className="font-mono text-[10px] text-slate-600 uppercase">{form.tagBg}</span>
                      </div>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Nomor Urut</label>
                      <input
                        type="number"
                        min="1"
                        value={form.order}
                        onChange={(e) => setField('order', e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-xl focus:outline-[#4a98ad]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Gambar Banner (16:9 / 2:1) *</label>
                    <label
                      className={`w-full border-2 border-dashed border-[#8dbccd] rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-[#e8f0f7]/40 hover:bg-[#e8f0f7] transition-all ${
                        uploadingImage ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      {uploadingImage ? <Loader2 className="w-5 h-5 text-[#2f7088] animate-spin" /> : <Upload className="w-5 h-5 text-[#2f7088]" />}
                      <span className="text-xs font-bold text-[#2f7088]">
                        {uploadingImage ? 'Mengunggah gambar...' : form.imageUrl ? 'Ganti gambar' : '+ Pilih gambar dari laptop (maks. 2 MB)'}
                      </span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploadingImage} />
                    </label>
                  </div>

                  <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setField('isActive', e.target.checked)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span>
                      <span className="font-bold text-slate-800 block">Langsung tayangkan di aplikasi</span>
                      <span className="text-slate-500">Hilangkan centang untuk menyimpannya sebagai draf nonaktif.</span>
                    </span>
                  </label>
                </div>

                {/* Pratinjau kartu */}
                <div className="md:col-span-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pratinjau</div>
                  <div className="relative aspect-[16/8] rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shadow-sm">
                    {form.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.imageUrl} alt="Pratinjau" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-400">Belum ada gambar</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <span
                      className="absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow"
                      style={{ backgroundColor: form.tagBg }}
                    >
                      {form.tag.trim().toUpperCase() || 'PROMO'}
                    </span>
                    <div className="absolute bottom-2 left-3 right-3">
                      <div className="text-white text-xs font-extrabold leading-tight line-clamp-2">{form.title || 'Judul banner'}</div>
                      <div className="text-white/80 text-[10px] leading-tight line-clamp-1 mt-0.5">{form.description || 'Keterangan singkat'}</div>
                    </div>
                  </div>
                  {form.imageUrl && (
                    <button type="button" onClick={() => setField('imageUrl', '')} className="mt-2 text-[11px] text-rose-600 font-semibold hover:underline">
                      Hapus gambar ini
                    </button>
                  )}
                  <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                    Teks di atas gambar bisa terpotong di layar HP yang kecil. Pakai judul yang singkat.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
                <button type="button" onClick={() => setModalOpen(false)} className={BTN_GHOST}>
                  Batal
                </button>
                <button type="submit" disabled={saving || uploadingImage} className={BTN_PRIMARY}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {editingId ? 'Simpan Perubahan' : 'Terbitkan Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ KONFIRMASI HAPUS ============ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-100 p-5 text-center">
            <div className="w-11 h-11 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mt-3">Hapus banner ini?</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              <b>{deleteTarget.title}</b> akan hilang dari aplikasi. Kalau hanya ingin berhenti menayangkan sementara, lebih baik <b>nonaktifkan</b>.
              Penghapusan tetap tercatat di Riwayat.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)} className={`${BTN_GHOST} flex-1`}>
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={busyId === deleteTarget.id}
                className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                {busyId === deleteTarget.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Ya, hapus
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}