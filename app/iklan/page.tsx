'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, X, Upload, GripVertical, ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react';

interface Ad {
  id: string;
  category: 'kost' | 'laundry' | 'makan' | 'lainnya';
  title: string | null;
  subtitle: string | null;
  badge_text: string | null;
  image_url: string | null;
  property_id: string | null;
  external_url: string | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  sort_order: number;
  advertiser_name: string | null;
  advertiser_phone: string | null;
  paid_amount: number;
  notes: string | null;
  discount_percent: number | null;
  property_name: string | null;
  property_image: string | null;
  property_ok: boolean | null;
  views: number;
  clicks: number;
}
interface PropOption { id: string; name: string; location: string | null }
interface Result { success?: boolean; message?: string; id?: string }

const CARD = 'bg-white/90 border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.3)]';
const CAT_LABEL: Record<string, string> = { kost: 'Kost', laundry: 'Laundry', makan: 'Makanan', lainnya: 'Lainnya' };
const DAY = 86400000;

const rp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

type Status = 'live' | 'scheduled' | 'ended' | 'off' | 'broken';
function statusOf(a: Ad, now: number): Status {
  if (!a.is_active) return 'off';
  if (a.property_id && !a.property_ok) return 'broken';
  if (new Date(a.ends_at).getTime() <= now) return 'ended';
  if (new Date(a.starts_at).getTime() > now) return 'scheduled';
  return 'live';
}
const STATUS_UI: Record<Status, { label: string; cls: string }> = {
  live: { label: 'Tayang', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  scheduled: { label: 'Terjadwal', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  ended: { label: 'Berakhir', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  off: { label: 'Dimatikan', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  broken: { label: 'Kost nonaktif', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

interface Form {
  id: string;
  category: Ad['category'];
  property_id: string;
  title: string;
  subtitle: string;
  badge_text: string;
  image_url: string;
  external_url: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  advertiser_name: string;
  advertiser_phone: string;
  paid_amount: string;
  notes: string;
  discount_percent: string;
}
const emptyForm = (): Form => ({
  id: '', category: 'kost', property_id: '', title: '', subtitle: '', badge_text: '', image_url: '', external_url: '',
  starts_at: toLocalInput(new Date().toISOString()),
  ends_at: toLocalInput(new Date(Date.now() + 30 * DAY).toISOString()),
  is_active: true, advertiser_name: '', advertiser_phone: '', paid_amount: '0', notes: '', discount_percent: '',
});

export default function IklanPage() {
  const [now] = useState(() => Date.now());
  const [ads, setAds] = useState<Ad[]>([]);
  const [max, setMax] = useState(10);
  const [maxInput, setMaxInput] = useState('10');
  const [options, setOptions] = useState<PropOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [l, o] = await Promise.all([supabase.rpc('admin_ads_list'), supabase.rpc('admin_ads_property_options')]);
    if (l.error) {
      setError(l.error.message + ' Pastikan SQL Part BN sudah dijalankan di Supabase SQL Editor.');
      setLoaded(true);
      return;
    }
    const d = l.data as { max: number; items: Ad[] };
    setAds(d.items ?? []);
    setMax(d.max);
    setMaxInput(String(d.max));
    setOptions(((o.data ?? []) as PropOption[]) || []);
    setError('');
    setLoaded(true);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);

  const statusMap = useMemo(() => {
    const m: Record<string, Status> = {};
    ads.forEach((a) => { m[a.id] = statusOf(a, now); });
    return m;
  }, [ads, now]);

  // Posisi tampil di slider: hanya yang berstatus Tayang, urut dari atas, sebanyak batas
  const slotMap = useMemo(() => {
    const m: Record<string, number> = {};
    let n = 0;
    ads.forEach((a) => { if (statusMap[a.id] === 'live') { n += 1; m[a.id] = n; } });
    return m;
  }, [ads, statusMap]);

  const summary = useMemo(() => {
    let live = 0, sched = 0, soon = 0, views = 0, clicks = 0, paid = 0;
    ads.forEach((a) => {
      const st = statusMap[a.id];
      if (st === 'live') {
        live += 1;
        if (new Date(a.ends_at).getTime() - now <= 7 * DAY) soon += 1;
      }
      if (st === 'scheduled') sched += 1;
      views += a.views; clicks += a.clicks; paid += Number(a.paid_amount || 0);
    });
    return { live, sched, soon, views, clicks, paid };
  }, [ads, statusMap, now]);

  const saveOrder = async (list: Ad[]) => {
    setAds(list);
    const { data, error: e } = await supabase.rpc('admin_ads_reorder', { p_ids: list.map((a) => a.id) });
    const r = data as Result | null;
    if (e || !r?.success) { alert(e?.message || r?.message || 'Urutan gagal disimpan.'); await load(); }
  };
  const move = (id: string, dir: -1 | 1) => {
    const list = [...ads];
    const i = list.findIndex((a) => a.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void saveOrder(list);
  };
  const dropOn = (targetId: string) => {
    const from = dragId;
    setDragId(null); setOverId(null);
    if (!from || from === targetId) return;
    const list = [...ads];
    const i = list.findIndex((a) => a.id === from);
    const j = list.findIndex((a) => a.id === targetId);
    if (i < 0 || j < 0) return;
    const [item] = list.splice(i, 1);
    list.splice(j, 0, item);
    void saveOrder(list);
  };

  const toggle = async (a: Ad) => {
    setBusy(true);
    const { data, error: e } = await supabase.rpc('admin_ad_set_active', { p_id: a.id, p_active: !a.is_active });
    const r = data as Result | null;
    if (e || !r?.success) alert(e?.message || r?.message || 'Gagal mengubah status.');
    await load();
    setBusy(false);
  };
  const remove = async (a: Ad) => {
    if (!confirm(`Hapus iklan "${a.title || a.property_name || a.advertiser_name}"? Angka tayang dan ketuknya ikut hilang.`)) return;
    setBusy(true);
    const { data, error: e } = await supabase.rpc('admin_ad_delete', { p_id: a.id });
    const r = data as Result | null;
    if (e || !r?.success) alert(e?.message || r?.message || 'Gagal menghapus.');
    await load();
    setBusy(false);
  };
  const saveMax = async () => {
    const n = parseInt(maxInput, 10);
    if (!n || n < 1 || n > 30) { alert('Batas tayang 1 sampai 30.'); return; }
    setBusy(true);
    const { data, error: e } = await supabase.rpc('admin_ads_set_max', { p_max: n });
    const r = data as Result | null;
    if (e || !r?.success) alert(e?.message || r?.message || 'Gagal menyimpan.');
    await load();
    setBusy(false);
  };

  const openEdit = (a: Ad) => setForm({
    id: a.id, category: a.category, property_id: a.property_id ?? '', title: a.title ?? '', subtitle: a.subtitle ?? '',
    badge_text: a.badge_text ?? '', image_url: a.image_url ?? '', external_url: a.external_url ?? '',
    starts_at: toLocalInput(a.starts_at), ends_at: toLocalInput(a.ends_at), is_active: a.is_active,
    advertiser_name: a.advertiser_name ?? '', advertiser_phone: a.advertiser_phone ?? '',
    paid_amount: String(a.paid_amount ?? 0), notes: a.notes ?? '',
    discount_percent: a.discount_percent ? String(a.discount_percent) : '',
  });

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    if (file.size > 2 * 1024 * 1024) { alert('Ukuran gambar maksimal 2 MB.'); e.target.value = ''; return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `ads/ad_${Date.now()}.${ext}`;
      const { error: up } = await supabase.storage.from('kamar-kita').upload(path, file, { contentType: file.type, upsert: true });
      if (up) throw up;
      const { data } = supabase.storage.from('kamar-kita').getPublicUrl(path);
      if (data?.publicUrl) setForm({ ...form, image_url: data.publicUrl });
    } catch (err: unknown) {
      alert((err as { message?: string } | null)?.message || 'Gagal mengunggah gambar.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const payload = {
      id: form.id || null,
      category: form.category,
      property_id: form.category === 'kost' ? form.property_id || null : null,
      title: form.title,
      subtitle: form.subtitle,
      badge_text: form.badge_text,
      image_url: form.image_url,
      external_url: form.external_url,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      is_active: form.is_active,
      advertiser_name: form.advertiser_name,
      advertiser_phone: form.advertiser_phone,
      paid_amount: Number(form.paid_amount) || 0,
      notes: form.notes,
      discount_percent: form.category === 'kost' && form.discount_percent ? Number(form.discount_percent) : null,
    };
    const { data, error: er } = await supabase.rpc('admin_ad_save', { p: payload });
    const r = data as Result | null;
    setSaving(false);
    if (er || !r?.success) { alert(er?.message || r?.message || 'Gagal menyimpan iklan.'); return; }
    setForm(null);
    await load();
  };

  const input = 'w-full p-2 border rounded-lg focus:outline-blue-500 bg-white';
  const lab = 'font-semibold text-slate-700 block mb-1';

  if (!loaded) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Iklan Promo Terbaik</h2>
          <p className="text-sm text-slate-500 mt-1">Atur siapa yang tampil di slider Explore. Geser untuk mengubah urutan, yang paling atas tampil pertama.</p>
        </div>
        <button
          onClick={() => setForm(emptyForm())}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Tambah iklan
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { l: 'Tayang sekarang', v: String(summary.live), s: `dari batas ${max} slot` },
          { l: 'Terjadwal', v: String(summary.sched), s: 'belum mulai' },
          { l: 'Segera berakhir', v: String(summary.soon), s: 'dalam 7 hari' },
          { l: 'Tayang dan ketuk', v: `${summary.views.toLocaleString('id-ID')} / ${summary.clicks.toLocaleString('id-ID')}`, s: 'semua iklan' },
          { l: 'Total dibayar', v: rp(summary.paid), s: 'semua iklan' },
        ].map((c) => (
          <div key={c.l} className={`${CARD} p-4`}>
            <div className="text-[11px] font-semibold text-slate-500">{c.l}</div>
            <div className="text-lg font-extrabold text-slate-800 mt-1 leading-tight">{c.v}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{c.s}</div>
          </div>
        ))}
      </div>

      <div className={`${CARD} p-4 flex flex-col sm:flex-row sm:items-center gap-3`}>
        <div className="flex-1">
          <div className="text-sm font-bold text-slate-800">Batas tayang di slider</div>
          <div className="text-xs text-slate-500">Hanya sebanyak ini iklan teratas (yang sedang tayang) yang muncul di aplikasi. Sisanya antre.</div>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={30} value={maxInput} onChange={(e) => setMaxInput(e.target.value)} className="w-20 p-2 border rounded-lg text-sm text-center" />
          <button onClick={saveMax} disabled={busy || maxInput === String(max)} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold disabled:opacity-40">Simpan</button>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {ads.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Belum ada iklan. Tambahkan dari sini, atau dari halaman Hunian lewat tombol Promo di tiap kost.</div>
        ) : (
          <ul className="divide-y divide-slate-200/70">
            {ads.map((a, idx) => {
              const st = statusMap[a.id];
              const slot = slotMap[a.id];
              const shown = slot !== undefined && slot <= max;
              const name = a.title || a.property_name || a.advertiser_name || 'Tanpa judul';
              const img = a.image_url || a.property_image || '';
              const ctr = a.views > 0 ? ((a.clicks / a.views) * 100).toFixed(1) : '0';
              return (
                <li
                  key={a.id}
                  draggable
                  onDragStart={() => setDragId(a.id)}
                  onDragOver={(e) => { e.preventDefault(); if (overId !== a.id) setOverId(a.id); }}
                  onDrop={() => dropOn(a.id)}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  className={`flex flex-col lg:flex-row lg:items-center gap-3 p-4 transition-colors ${dragId === a.id ? 'opacity-40' : ''} ${overId === a.id && dragId !== a.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <GripVertical className="w-4 h-4 text-slate-400 cursor-grab" />
                    <div className="flex flex-col">
                      <button onClick={() => move(a.id, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20" aria-label="Naik"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => move(a.id, 1)} disabled={idx === ads.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20" aria-label="Turun"><ChevronDown className="w-4 h-4" /></button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img ? <img src={img} alt="" className="w-16 h-12 rounded-lg object-cover bg-slate-100 border border-slate-200" /> : <div className="w-16 h-12 rounded-lg bg-slate-100 border border-slate-200" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-sm truncate max-w-full">{name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_UI[st].cls}`}>{STATUS_UI[st].label}</span>
                      {st === 'live' && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${shown ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {shown ? `Slot ${slot}` : 'Antre'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {CAT_LABEL[a.category]}{a.discount_percent ? ` • Diskon ${a.discount_percent}%` : ''}{a.advertiser_name ? ` • ${a.advertiser_name}` : ''} • {fmtDate(a.starts_at)} sampai {fmtDate(a.ends_at)}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center shrink-0 text-[11px] text-slate-500">
                    <div><div className="font-bold text-slate-800 text-sm">{a.views.toLocaleString('id-ID')}</div>tayang</div>
                    <div><div className="font-bold text-slate-800 text-sm">{a.clicks.toLocaleString('id-ID')}</div>ketuk ({ctr}%)</div>
                    <div><div className="font-bold text-slate-800 text-sm">{rp(Number(a.paid_amount))}</div>dibayar</div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => toggle(a)} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {a.is_active ? 'Matikan' : 'Nyalakan'}
                    </button>
                    <button onClick={() => openEdit(a)} className="p-2 rounded-lg text-blue-600 bg-blue-50 border border-blue-200/60 hover:bg-blue-100" aria-label="Ubah"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(a)} disabled={busy} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">{form.id ? 'Ubah iklan' : 'Tambah iklan'}</h3>
              <button onClick={() => setForm(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lab}>Kategori</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Ad['category'] })} className={input}>
                    {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lab}>Keterangan singkat (opsional)</label>
                  <input value={form.badge_text} maxLength={24} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} placeholder="Bulan ini" className={input} />
                </div>
              </div>

              {form.category === 'kost' && (
                <div>
                  <label className={lab}>Diskon (persen, opsional)</label>
                  <input type="number" min={1} max={90} value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} placeholder="10" className={input} />
                  <p className="text-[11px] text-slate-400 mt-1">Di aplikasi: harga normal kost dicoret, harga setelah diskon tampil otomatis. Pastikan pemilik kost memang memberi diskon ini.</p>
                </div>
              )}

              {form.category === 'kost' ? (
                <div>
                  <label className={lab}>Kost tujuan</label>
                  <select value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })} className={input}>
                    <option value="">Pilih kost</option>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.location ? ` (${o.location})` : ''}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">Judul, foto, dan lokasi ikut data kost kalau dikosongkan di bawah.</p>
                </div>
              ) : (
                <div>
                  <label className={lab}>Link tujuan</label>
                  <input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://wa.me/62..." className={input} />
                </div>
              )}

              <div>
                <label className={lab}>Judul{form.category === 'kost' && form.property_id ? ' (kosongkan untuk memakai nama kost)' : ''}</label>
                <input value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} />
              </div>
              <div>
                <label className={lab}>Subjudul</label>
                <input value={form.subtitle} maxLength={120} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className={input} />
              </div>

              <div>
                <label className={lab}>Gambar{form.category === 'kost' && form.property_id ? ' (kosongkan untuk memakai foto kost)' : ''}</label>
                <div className="flex gap-2">
                  <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." className={input} />
                  <label className="inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 shrink-0">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Unggah
                    <input type="file" accept="image/*" className="hidden" onChange={upload} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lab}>Mulai tayang</label>
                  <input type="datetime-local" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className={input} />
                </div>
                <div>
                  <label className={lab}>Selesai tayang</label>
                  <input type="datetime-local" required value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className={input} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lab}>Nama pengiklan</label>
                  <input value={form.advertiser_name} onChange={(e) => setForm({ ...form, advertiser_name: e.target.value })} className={input} />
                </div>
                <div>
                  <label className={lab}>HP pengiklan</label>
                  <input value={form.advertiser_phone} onChange={(e) => setForm({ ...form, advertiser_phone: e.target.value })} className={input} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lab}>Nominal dibayar (Rp)</label>
                  <input type="number" min={0} value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} className={input} />
                </div>
                <label className="flex items-center gap-2 mt-6 font-semibold text-slate-700">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Langsung aktif
                </label>
              </div>
              <div>
                <label className={lab}>Catatan internal</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-600">Batal</button>
                <button type="submit" disabled={saving || uploading} className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}