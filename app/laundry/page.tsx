'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, X, Upload, Search, Star, Pencil, Trash2, MessageCircle } from 'lucide-react';

interface Laundry {
  id: number;
  created_at: string;
  service_type: string;
  name: string;
  owner_name: string | null;
  whatsapp: string | null;
  price_start: string | null;
  price_unit: string | null;
  area: string | null;
  description: string | null;
  services_offered: string | null;
  image_url: string | null;
  photos: string[] | null;
  is_popular: boolean | null;
  is_active: boolean | null;
}

interface Form {
  id: number | null;
  name: string;
  owner_name: string;
  whatsapp: string;
  area: string;
  price_start: string;
  price_unit: string;
  description: string;
  services: string[];
  photos: string[];
  is_popular: boolean;
  is_active: boolean;
}

const CARD = 'bg-white/90 border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.3)]';
const QUICK_SERVICES = ['Cuci kiloan', 'Cuci satuan', 'Setrika', 'Express', 'Antar jemput', 'Cuci sepatu', 'Cuci bedcover', 'Dry clean'];
const MAX_PHOTOS = 6;
const MAX_FILE = 2 * 1024 * 1024;

const emptyForm = (): Form => ({
  id: null, name: '', owner_name: '', whatsapp: '', area: '', price_start: '', price_unit: '/kg',
  description: '', services: [], photos: [], is_popular: false, is_active: true,
});

// 08xxx atau +62xxx menjadi 62xxx (hanya angka)
function normPhone(raw: string): string {
  let d = (raw || '').replace(/[^0-9]/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}

const splitServices = (s: string | null) =>
  (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export default function LaundryPage() {
  const [items, setItems] = useState<Laundry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'active' | 'off'>('all');
  const [form, setForm] = useState<Form | null>(null);
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('services_listings')
      .select('*')
      .eq('service_type', 'laundry')
      .order('created_at', { ascending: false });
    if (e) {
      setError(e.message);
    } else {
      setItems((data ?? []) as Laundry[]);
      setError('');
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (tab === 'active' && i.is_active === false) return false;
      if (tab === 'off' && i.is_active !== false) return false;
      if (!q) return true;
      return [i.name, i.owner_name, i.area, i.services_offered].some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [items, query, tab]);

  const counts = useMemo(() => ({
    all: items.length,
    active: items.filter((i) => i.is_active !== false).length,
    off: items.filter((i) => i.is_active === false).length,
  }), [items]);

  const openEdit = (i: Laundry) => {
    const photos = Array.isArray(i.photos) && i.photos.length > 0 ? i.photos : i.image_url ? [i.image_url] : [];
    setExtra('');
    setForm({
      id: i.id, name: i.name ?? '', owner_name: i.owner_name ?? '', whatsapp: i.whatsapp ?? '', area: i.area ?? '',
      price_start: i.price_start ?? '', price_unit: i.price_unit ?? '', description: i.description ?? '',
      services: splitServices(i.services_offered), photos, is_popular: !!i.is_popular, is_active: i.is_active !== false,
    });
  };

  // Catatan Aktivitas: dicoba, tapi tidak boleh menggagalkan aksi utama
  const logAct = async (action: string, id: string | number, nm: string, extra?: Record<string, unknown>) => {
    try { await supabase.rpc('admin_log_laundry', { p_action: action, p_id: String(id), p_name: nm, p_extra: extra ?? null }); } catch { /* abaikan */ }
  };

  const toggleField = async (i: Laundry, field: 'is_active' | 'is_popular') => {
    setBusyId(i.id);
    const next = field === 'is_active' ? i.is_active === false : !i.is_popular;
    const { error: e } = await supabase.from('services_listings').update({ [field]: next }).eq('id', i.id);
    if (e) alert(e.message);
    else await logAct(field === 'is_active' ? 'laundry_toggle' : 'laundry_popular', i.id, i.name, { value: next });
    await load();
    setBusyId(null);
  };

  const remove = async (i: Laundry) => {
    if (!confirm(`Hapus laundry "${i.name}"? Data ini tidak bisa dikembalikan.`)) return;
    setBusyId(i.id);
    const { error: e } = await supabase.from('services_listings').delete().eq('id', i.id);
    if (e) alert(e.message);
    else await logAct('laundry_delete', i.id, i.name);
    await load();
    setBusyId(null);
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!form || files.length === 0) return;
    const room = MAX_PHOTOS - form.photos.length;
    if (room <= 0) { alert(`Maksimal ${MAX_PHOTOS} foto.`); return; }
    setUploading(true);
    const urls: string[] = [];
    try {
      for (const file of files.slice(0, room)) {
        if (file.size > MAX_FILE) { alert(`"${file.name}" lebih dari 2 MB, dilewati.`); continue; }
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `laundry/l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: up } = await supabase.storage.from('kamar-kita').upload(path, file, { contentType: file.type, upsert: true });
        if (up) throw up;
        const { data } = supabase.storage.from('kamar-kita').getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }
      setForm((f) => (f ? { ...f, photos: [...f.photos, ...urls] } : f));
    } catch (err: unknown) {
      alert((err as { message?: string } | null)?.message || 'Gagal mengunggah foto.');
    } finally {
      setUploading(false);
    }
  };

  const toggleService = (s: string) => {
    if (!form) return;
    const has = form.services.some((x) => x.toLowerCase() === s.toLowerCase());
    setForm({ ...form, services: has ? form.services.filter((x) => x.toLowerCase() !== s.toLowerCase()) : [...form.services, s] });
  };
  const addExtra = () => {
    const v = extra.trim();
    if (!v || !form) return;
    if (!form.services.some((x) => x.toLowerCase() === v.toLowerCase())) setForm({ ...form, services: [...form.services, v] });
    setExtra('');
  };
  const makeCover = (idx: number) => {
    if (!form || idx === 0) return;
    const p = [...form.photos];
    const [it] = p.splice(idx, 1);
    p.unshift(it);
    setForm({ ...form, photos: p });
  };
  const dropPhoto = (idx: number) => {
    if (!form) return;
    setForm({ ...form, photos: form.photos.filter((_, i) => i !== idx) });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    if (!name) { alert('Nama laundry wajib diisi.'); return; }
    const wa = normPhone(form.whatsapp);
    if (form.whatsapp.trim() && (wa.length < 10 || wa.length > 15)) { alert('Nomor WhatsApp tidak valid. Contoh: 081234567890'); return; }
    setSaving(true);
    const payload = {
      service_type: 'laundry',
      name,
      owner_name: form.owner_name.trim() || null,
      whatsapp: wa || null,
      area: form.area.trim() || null,
      price_start: form.price_start.trim() || null,
      price_unit: form.price_unit.trim() || null,
      description: form.description.trim() || null,
      services_offered: form.services.length ? form.services.join(', ') : null,
      image_url: form.photos[0] ?? null,
      photos: form.photos,
      is_popular: form.is_popular,
      is_active: form.is_active,
    };
    let er: { message: string } | null = null;
    let savedId: number | undefined = form.id ?? undefined;
    if (form.id) {
      er = (await supabase.from('services_listings').update(payload).eq('id', form.id)).error;
    } else {
      const r = await supabase.from('services_listings').insert([payload]).select('id').single();
      er = r.error;
      savedId = r.data?.id as number | undefined;
    }
    setSaving(false);
    if (er) { alert(er.message); return; }
    await logAct(form.id ? 'laundry_update' : 'laundry_create', savedId ?? '-', name);
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
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Laundry</h2>
          <p className="text-sm text-slate-500 mt-1">Kelola mitra laundry yang tampil di aplikasi (Pim Wash).</p>
        </div>
        <button
          onClick={() => { setExtra(''); setForm(emptyForm()); }}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Tambah laundry
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200">{error}</div>}

      <div className={`${CARD} p-3 flex flex-col sm:flex-row gap-3 sm:items-center`}>
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, pemilik, area, atau layanan" className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm bg-white" />
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold border border-slate-200">
          {([['all', 'Semua'], ['active', 'Aktif'], ['off', 'Nonaktif']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg ${tab === k ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600'}`}>
              {l} ({counts[k]})
            </button>
          ))}
        </div>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        {shown.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">{items.length === 0 ? 'Belum ada laundry. Tambahkan yang pertama.' : 'Tidak ada yang cocok dengan pencarian.'}</div>
        ) : (
          <ul className="divide-y divide-slate-200/70">
            {shown.map((i) => {
              const img = (Array.isArray(i.photos) && i.photos[0]) || i.image_url || '';
              const wa = normPhone(i.whatsapp ?? '');
              const off = i.is_active === false;
              return (
                <li key={i.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {img ? <img src={img} alt="" className="w-20 h-16 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0" /> : <div className="w-20 h-16 rounded-xl bg-slate-100 border border-slate-200 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-sm">{i.name}</span>
                      {i.is_popular && <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">POPULER</span>}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${off ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{off ? 'Nonaktif' : 'Aktif'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {[i.area, i.owner_name, i.price_start ? `Mulai Rp ${i.price_start}${i.price_unit ?? ''}` : null].filter(Boolean).join(' • ') || 'Belum ada keterangan'}
                    </div>
                    {i.services_offered && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{i.services_offered}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {wa && (
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200/60" title="Hubungi pemilik">
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button onClick={() => toggleField(i, 'is_popular')} disabled={busyId === i.id} title="Tandai populer" className={`p-2 rounded-lg border ${i.is_popular ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-slate-400 bg-white border-slate-200 hover:text-amber-600'}`}>
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleField(i, 'is_active')} disabled={busyId === i.id} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      {off ? 'Aktifkan' : 'Nonaktifkan'}
                    </button>
                    <button onClick={() => openEdit(i)} className="p-2 rounded-lg text-blue-600 bg-blue-50 border border-blue-200/60 hover:bg-blue-100" aria-label="Ubah"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(i)} disabled={busyId === i.id} className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
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
              <h3 className="font-bold text-slate-900 text-sm">{form.id ? 'Ubah laundry' : 'Tambah laundry'}</h3>
              <button onClick={() => setForm(null)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={submit} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className={lab}>Nama laundry *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={input} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lab}>Nama pemilik</label>
                  <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} className={input} />
                </div>
                <div>
                  <label className={lab}>WhatsApp</label>
                  <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="081234567890" className={input} />
                </div>
              </div>
              <div>
                <label className={lab}>Area</label>
                <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Jatinangor" className={input} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lab}>Harga mulai (angka atau singkatan)</label>
                  <input value={form.price_start} onChange={(e) => setForm({ ...form, price_start: e.target.value })} placeholder="6.000" className={input} />
                </div>
                <div>
                  <label className={lab}>Satuan</label>
                  <input value={form.price_unit} onChange={(e) => setForm({ ...form, price_unit: e.target.value })} placeholder="/kg" className={input} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 -mt-2">Di aplikasi tampil: &quot;Mulai Rp {form.price_start || '6.000'}{form.price_unit}&quot;</p>

              <div>
                <label className={lab}>Layanan yang tersedia</label>
                <div className="flex flex-wrap gap-1.5">
                  {[...QUICK_SERVICES, ...form.services.filter((s) => !QUICK_SERVICES.some((q) => q.toLowerCase() === s.toLowerCase()))].map((s) => {
                    const on = form.services.some((x) => x.toLowerCase() === s.toLowerCase());
                    return (
                      <button type="button" key={s} onClick={() => toggleService(s)} className={`px-3 py-1.5 rounded-full border font-semibold ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} placeholder="Layanan lain, lalu tekan Enter" className={input} />
                  <button type="button" onClick={addExtra} className="px-3 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 shrink-0">Tambah</button>
                </div>
              </div>

              <div>
                <label className={lab}>Deskripsi</label>
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
              </div>

              <div>
                <label className={lab}>Foto (maksimal {MAX_PHOTOS}, 2 MB per foto). Foto pertama jadi sampul.</label>
                <div className="grid grid-cols-3 gap-2">
                  {form.photos.map((u, idx) => (
                    <div key={u} className="relative rounded-lg overflow-hidden border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="w-full h-20 object-cover" />
                      {idx === 0 && <span className="absolute left-1 top-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Sampul</span>}
                      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1.5 py-1 text-[10px] text-white font-semibold">
                        <button type="button" onClick={() => makeCover(idx)} disabled={idx === 0} className="disabled:opacity-40">Jadi sampul</button>
                        <button type="button" onClick={() => dropPhoto(idx)}>Hapus</button>
                      </div>
                    </div>
                  ))}
                  {form.photos.length < MAX_PHOTOS && (
                    <label className="h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-500 cursor-pointer hover:bg-slate-50 font-semibold">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span className="mt-1">Unggah</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={upload} />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <input type="checkbox" checked={form.is_popular} onChange={(e) => setForm({ ...form, is_popular: e.target.checked })} /> Tandai populer
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Aktif (tampil di aplikasi)
                </label>
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