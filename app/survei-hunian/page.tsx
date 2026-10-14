'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Loader2,
  X,
  MapPin,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Phone,
} from 'lucide-react';

// Nomor WhatsApp admin PimPim yang dipasang di listing saat Approve (format 62...).
// Ganti di sini kalau nomornya berbeda.
const NOMOR_WA_ADMIN = '62881025075498';

type Status = 'pending' | 'approved' | 'rejected';
type Cek = 'lokasi_dicek' | 'pemilik_dihubungi' | 'foto_dicek';

interface FotoRow {
  id: string;
  path: string;
  urutan: number;
}

interface Survei {
  id: string;
  petugas_id: string;
  nama_hunian: string;
  kategori: string;
  untuk: string | null;
  alamat: string;
  jumlah_kamar: number | null;
  harga_per_bulan: number | null;
  harga_per_tahun: number | null;
  ukuran_kamar: string | null;
  tipe_unit: string | null;
  deskripsi: string | null;
  fasilitas: string[] | null;
  nama_pemilik: string | null;
  hp_pemilik: string | null;
  latitude: number | null;
  longitude: number | null;
  status: Status;
  catatan_admin: string | null;
  dibuat_pada: string;
  disetujui_pada: string | null;
  lokasi_dicek: boolean;
  pemilik_dihubungi: boolean;
  foto_dicek: boolean;
  properti_id: string | null;
  survei_hunian_foto: FotoRow[] | null;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

const STATUS_CLASS: Record<Status, string> = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border border-rose-200',
};

const rupiah = (n: number | null) => (n ? `Rp ${Number(n).toLocaleString('id-ID')}` : '-');
const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export default function SurveiHunianPage() {
  const [items, setItems] = useState<Survei[]>([]);
  const [petugas, setPetugas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Status | 'all'>('pending');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<Survei | null>(null);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [loadingFoto, setLoadingFoto] = useState(false);
  const [catatan, setCatatan] = useState('');
  const [whatsapp, setWhatsapp] = useState(NOMOR_WA_ADMIN);
  const [aktif, setAktif] = useState(true);
  const [populer, setPopuler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progres, setProgres] = useState('');
  const [pesan, setPesan] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      const [sv, st] = await Promise.all([
        supabase
          .from('survei_hunian')
          .select('*, survei_hunian_foto(id, path, urutan)')
          .order('dibuat_pada', { ascending: false }),
        supabase.from('staf').select('id, nama'),
      ]);
      if (!isMounted) return;
      if (sv.error) {
        setLoadError(`Gagal memuat survei: ${sv.error.message}`);
      } else {
        setLoadError('');
        setItems((sv.data ?? []) as unknown as Survei[]);
      }
      if (!st.error && st.data) {
        const peta: Record<string, string> = {};
        (st.data as { id: string; nama: string }[]).forEach((s) => {
          peta[s.id] = s.nama;
        });
        setPetugas(peta);
      }
      setLoading(false);
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [tick]);

  const jumlah = (s: Status) => items.filter((i) => i.status === s).length;

  const tampil = items.filter((i) => {
    if (tab !== 'all' && i.status !== tab) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!i.nama_hunian.toLowerCase().includes(q) && !i.alamat.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const tabs: { key: Status | 'all'; label: string; count: number }[] = [
    { key: 'pending', label: 'Menunggu', count: jumlah('pending') },
    { key: 'approved', label: 'Disetujui', count: jumlah('approved') },
    { key: 'rejected', label: 'Ditolak', count: jumlah('rejected') },
    { key: 'all', label: 'Semua', count: items.length },
  ];

  const perbarui = (baru: Survei) => {
    setSelected(baru);
    setItems((prev) => prev.map((i) => (i.id === baru.id ? baru : i)));
  };

  const bukaDetail = async (s: Survei) => {
    setSelected(s);
    setCatatan(s.catatan_admin ?? '');
    setWhatsapp(NOMOR_WA_ADMIN);
    setAktif(true);
    setPopuler(false);
    setPesan('');
    setProgres('');
    setFotoUrls({});
    const daftar = [...(s.survei_hunian_foto ?? [])].sort((a, b) => a.urutan - b.urutan);
    if (daftar.length === 0) return;
    setLoadingFoto(true);
    const { data } = await supabase.storage
      .from('survei-hunian')
      .createSignedUrls(daftar.map((f) => f.path), 3600);
    const peta: Record<string, string> = {};
    (data ?? []).forEach((d) => {
      if (d.path && d.signedUrl) peta[d.path] = d.signedUrl;
    });
    setFotoUrls(peta);
    setLoadingFoto(false);
  };

  const toggleCek = async (kolom: Cek) => {
    if (!selected || selected.status !== 'pending' || busy) return;
    const nilai = !selected[kolom];
    const { error } = await supabase.from('survei_hunian').update({ [kolom]: nilai }).eq('id', selected.id);
    if (error) {
      setPesan(`Gagal menyimpan centang: ${error.message}`);
      return;
    }
    perbarui({ ...selected, [kolom]: nilai });
  };

  const tolak = async () => {
    if (!selected || busy) return;
    if (!catatan.trim()) {
      setPesan('Isi catatan alasan penolakan dulu.');
      return;
    }
    setBusy(true);
    setPesan('');
    const { data, error } = await supabase
      .from('survei_hunian')
      .update({ status: 'rejected', catatan_admin: catatan.trim() })
      .eq('id', selected.id)
      .eq('status', 'pending')
      .select('id');
    setBusy(false);
    if (error || !data || data.length === 0) {
      setPesan(`Gagal menolak: ${error?.message ?? 'status survei sudah berubah, muat ulang halaman.'}`);
      return;
    }
    perbarui({ ...selected, status: 'rejected', catatan_admin: catatan.trim() });
  };

  const approve = async () => {
    if (!selected || busy) return;
    const s = selected;
    const fotos = [...(s.survei_hunian_foto ?? [])].sort((a, b) => a.urutan - b.urutan);
    const wa = whatsapp.replace(/[^0-9]/g, '');

    if (!s.lokasi_dicek || !s.pemilik_dihubungi || !s.foto_dicek) {
      setPesan('Centang ketiga daftar periksa kroscek dulu.');
      return;
    }
    if (fotos.length === 0) {
      setPesan('Survei ini belum punya foto, tidak bisa disetujui. Minta petugas mengirim ulang fotonya.');
      return;
    }
    if (s.latitude === null || s.longitude === null) {
      setPesan('Survei ini belum punya titik lokasi.');
      return;
    }
    if (wa.length < 9) {
      setPesan('Nomor WhatsApp listing belum benar.');
      return;
    }
    if (!confirm(`Setujui dan tayangkan "${s.nama_hunian}" ${aktif ? 'ke aplikasi PimPim' : '(nonaktif, belum tampil)'}?`)) return;

    setBusy(true);
    setPesan('');
    const diunggah: string[] = [];
    try {
      // 1. Salin foto dari bucket privat ke bucket publik yang dipakai PimPim
      const urlPublik: string[] = [];
      for (let i = 0; i < fotos.length; i++) {
        setProgres(`Menyalin foto ${i + 1} dari ${fotos.length}...`);
        const dl = await supabase.storage.from('survei-hunian').download(fotos[i].path);
        if (dl.error || !dl.data) throw new Error(`Foto ${i + 1} gagal diambil: ${dl.error?.message ?? 'kosong'}`);
        const namaFile = `properties/${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
        const up = await supabase.storage
          .from('kamar-kita')
          .upload(namaFile, dl.data, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw new Error(`Foto ${i + 1} gagal disalin: ${up.error.message}`);
        diunggah.push(namaFile);
        urlPublik.push(supabase.storage.from('kamar-kita').getPublicUrl(namaFile).data.publicUrl);
      }

      // 2. Tambahkan ke tabel properties (nomor pemilik TIDAK disalin)
      setProgres('Menambahkan ke daftar hunian...');
      const ins = await supabase
        .from('properties')
        .insert([
          {
            name: s.nama_hunian,
            category: s.kategori,
            tenant_type: s.untuk ?? 'CAMPUR',
            price_monthly: s.harga_per_bulan,
            price_yearly: s.harga_per_tahun,
            location: s.alamat,
            room_size: s.tipe_unit && s.ukuran_kamar ? `${s.tipe_unit} • ${s.ukuran_kamar}` : s.tipe_unit || s.ukuran_kamar,
            facilities: s.fasilitas ?? [],
            description: s.deskripsi,
            image_url: urlPublik[0],
            photos: urlPublik,
            maps_url: `https://www.google.com/maps?q=${s.latitude},${s.longitude}`,
            latitude: s.latitude,
            longitude: s.longitude,
            whatsapp: wa,
            available_rooms: s.jumlah_kamar ?? 1,
            tag: populer ? 'POPULER' : 'BARU',
            is_popular: populer,
            is_active: aktif,
          },
        ])
        .select('id')
        .single();
      if (ins.error || !ins.data) throw new Error(`Gagal menambah hunian: ${ins.error?.message ?? 'kosong'}`);
      const propId = ins.data.id as string;

      // 3. Tandai survei sebagai disetujui (hanya kalau masih pending)
      setProgres('Menyelesaikan...');
      const upd = await supabase
        .from('survei_hunian')
        .update({
          status: 'approved',
          properti_id: propId,
          disetujui_pada: new Date().toISOString(),
          catatan_admin: catatan.trim() || null,
        })
        .eq('id', s.id)
        .eq('status', 'pending')
        .select('id');
      if (upd.error || !upd.data || upd.data.length === 0) {
        await supabase.from('properties').delete().eq('id', propId);
        throw new Error(`Status survei gagal diperbarui: ${upd.error?.message ?? 'sudah berubah, muat ulang halaman.'}`);
      }

      perbarui({
        ...s,
        status: 'approved',
        properti_id: propId,
        disetujui_pada: new Date().toISOString(),
        catatan_admin: catatan.trim() || null,
      });
      setPesan('Berhasil disetujui. Hunian sudah masuk ke daftar Hunian.');
    } catch (e) {
      // Gagal di tengah jalan: bersihkan foto yang sempat tersalin
      if (diunggah.length > 0) await supabase.storage.from('kamar-kita').remove(diunggah);
      setPesan(e instanceof Error ? e.message : 'Terjadi kendala sistem.');
    } finally {
      setBusy(false);
      setProgres('');
    }
  };

  const fotoSelected = selected
    ? [...(selected.survei_hunian_foto ?? [])].sort((a, b) => a.urutan - b.urutan)
    : [];
  const bisaApprove =
    !!selected && selected.lokasi_dicek && selected.pemilik_dihubungi && selected.foto_dicek && fotoSelected.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Survei Hunian</h2>
          <p className="text-sm text-slate-500 mt-1">
            Kroscek data survei dari petugas lapangan, lalu setujui untuk tayang di Pim Kost.
          </p>
        </div>
        <button
          onClick={() => setTick((t) => t + 1)}
          className="self-start sm:self-auto px-4 py-2 rounded-full border border-slate-300 bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Muat ulang
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Menunggu', value: jumlah('pending'), cls: 'from-[#f3e3b8] to-[#e4c985]' },
          { label: 'Disetujui', value: jumlah('approved'), cls: 'from-[#8fd0c8] to-[#62aea8]' },
          { label: 'Ditolak', value: jumlah('rejected'), cls: 'from-[#eccaca] to-[#d9a5a5]' },
        ].map((k) => (
          <div
            key={k.label}
            className={`rounded-[20px] p-4 bg-gradient-to-br ${k.cls} shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55)]`}
          >
            <div className="text-[13px] font-bold text-slate-700">{k.label}</div>
            <div className="text-3xl font-extrabold tabular-nums mt-1 text-slate-800">{loading ? '-' : k.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-[22px] border border-white/70 bg-[#f6f8fc] shadow-[8px_10px_22px_rgba(48,66,92,0.16),-6px_-6px_16px_rgba(255,255,255,0.6)] overflow-hidden">
        <div className="flex gap-1 px-4 border-b border-slate-200 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-3.5 text-[13px] font-bold whitespace-nowrap border-b-2 transition ${
                tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] ${
                  tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama hunian atau alamat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] focus:outline-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-slate-500 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Memuat data survei
          </div>
        ) : loadError ? (
          <div className="py-14 text-center text-rose-600 text-sm px-6">{loadError}</div>
        ) : tampil.length === 0 ? (
          <div className="py-14 text-center text-slate-500 text-sm">Tidak ada survei di tab ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/70 border-y border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-5">Hunian</th>
                  <th className="py-3 px-4">Jenis</th>
                  <th className="py-3 px-4">Harga</th>
                  <th className="py-3 px-4">Petugas</th>
                  <th className="py-3 px-4">Masuk</th>
                  <th className="py-3 px-4 text-center">Foto</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {tampil.map((s) => {
                  const nFoto = (s.survei_hunian_foto ?? []).length;
                  return (
                    <tr key={s.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-slate-900 text-sm">{s.nama_hunian}</div>
                        <div className="text-[12px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" /> {s.alamat}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-200/70 text-slate-700">
                          {s.kategori}, {s.untuk ?? '-'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-semibold text-slate-800">
                        {s.harga_per_bulan ? `${rupiah(s.harga_per_bulan)} / bln` : s.harga_per_tahun ? `${rupiah(s.harga_per_tahun)} / thn` : '-'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-700">{petugas[s.petugas_id] ?? '-'}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">{tanggal(s.dibuat_pada)}</td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {nFoto > 0 ? (
                          <span className="font-bold text-slate-700">{nFoto}</span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            Belum ada
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`inline-block text-[11px] px-2.5 py-1 rounded-full font-bold ${STATUS_CLASS[s.status]}`}>
                          {STATUS_LABEL[s.status]}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <button
                          onClick={() => bukaDetail(s)}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> Tinjau
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-500 bg-slate-100/50">
          Menampilkan {tampil.length} dari {items.length} survei
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm leading-tight">{selected.nama_hunian}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {selected.kategori}, {selected.untuk ?? '-'} · oleh {petugas[selected.petugas_id] ?? '-'} ·{' '}
                  {tanggal(selected.dibuat_pada)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold ${STATUS_CLASS[selected.status]}`}>
                  {STATUS_LABEL[selected.status]}
                </span>
                <button onClick={() => setSelected(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <span className="font-bold text-slate-700 block mb-1.5 text-[11px] uppercase tracking-wider">
                  Foto ({fotoSelected.length})
                </span>
                {fotoSelected.length === 0 ? (
                  <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                    Survei ini belum punya foto. Kemungkinan pengiriman foto dari HP petugas belum selesai.
                  </p>
                ) : loadingFoto ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Memuat foto
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {fotoSelected.map((f, idx) => {
                      const url = fotoUrls[f.path];
                      return url ? (
                        <a
                          key={f.id}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="relative aspect-square rounded-lg overflow-hidden border bg-slate-100 block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`foto-${idx + 1}`} className="w-full h-full object-cover" />
                          {idx === 0 && (
                            <span className="absolute bottom-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                              Utama
                            </span>
                          )}
                        </a>
                      ) : (
                        <div key={f.id} className="aspect-square rounded-lg border bg-slate-100" />
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" /> Lokasi
                  </span>
                  {selected.latitude !== null && selected.longitude !== null && (
                    <a
                      href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 font-semibold text-[11px]"
                    >
                      Buka Google Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-slate-700">{selected.alamat}</p>
                <p className="text-[10px] text-slate-500 font-mono">
                  {selected.latitude ?? '-'}, {selected.longitude ?? '-'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1 text-[11px]">Harga</span>
                  <div className="text-slate-900 font-bold">{selected.harga_per_bulan ? `${rupiah(selected.harga_per_bulan)} / bulan` : 'Tidak ada harga bulanan'}</div>
                  {selected.harga_per_tahun ? (
                    <div className="text-slate-600">{rupiah(selected.harga_per_tahun)} / tahun</div>
                  ) : null}
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1 text-[11px]">Kamar</span>
                  <div className="text-slate-800 font-semibold">
                    {selected.tipe_unit ? `${selected.tipe_unit} · ` : ''}{selected.jumlah_kamar ?? '-'} tersedia · {selected.ukuran_kamar ?? 'ukuran -'}
                  </div>
                </div>
              </div>

              <div>
                <span className="font-bold text-slate-700 block mb-1.5 text-[11px]">Fasilitas</span>
                <div className="flex flex-wrap gap-1.5">
                  {(selected.fasilitas ?? []).length === 0 && <span className="text-slate-400">Tidak ada</span>}
                  {(selected.fasilitas ?? []).map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 font-medium text-[10px]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {selected.deskripsi && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-[11px] leading-relaxed">
                  <span className="font-bold block mb-0.5 text-slate-900">Deskripsi</span>
                  {selected.deskripsi}
                </div>
              )}

              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 space-y-1">
                <span className="font-bold text-amber-900 block text-[11px] uppercase tracking-wider">
                  Pemilik (internal, tidak tampil di PimPim)
                </span>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">{selected.nama_pemilik ?? '-'}</div>
                    <div className="text-slate-600 font-mono">{selected.hp_pemilik ?? '-'}</div>
                  </div>
                  {selected.hp_pemilik && (
                    <a
                      href={`https://wa.me/${selected.hp_pemilik.replace(/^0/, '62').replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700"
                    >
                      <Phone className="w-3.5 h-3.5" /> Hubungi
                    </a>
                  )}
                </div>
              </div>

              {selected.status === 'pending' ? (
                <>
                  <div className="p-3 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                      Daftar periksa kroscek
                    </span>
                    {[
                      { k: 'lokasi_dicek' as Cek, t: 'Lokasi di peta sudah dicek dan sesuai' },
                      { k: 'pemilik_dihubungi' as Cek, t: 'Pemilik sudah dihubungi dan datanya cocok' },
                      { k: 'foto_dicek' as Cek, t: 'Foto sudah dicek (jelas, sesuai hunian, tidak ada wajah)' },
                    ].map((c) => (
                      <label key={c.k} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected[c.k]}
                          onChange={() => toggleCek(c.k)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-slate-700">{c.t}</span>
                      </label>
                    ))}
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 space-y-3">
                    <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                      Pengaturan tayang di PimPim
                    </span>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        WhatsApp di listing (nomor admin PimPim)
                      </label>
                      <input
                        type="text"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        className="w-full p-2 border rounded-lg focus:outline-blue-500 font-mono"
                      />
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aktif}
                          onChange={() => setAktif(!aktif)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-slate-700">Langsung tampil di aplikasi (aktif)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={populer}
                          onChange={() => setPopuler(!populer)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-slate-700">Label POPULER</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Catatan admin (wajib kalau menolak)
                    </label>
                    <textarea
                      rows={2}
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                      className="w-full p-2 border rounded-lg focus:outline-blue-500"
                    />
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                  <div className="font-bold text-slate-800">
                    {selected.status === 'approved' ? 'Sudah disetujui' : 'Ditolak'}
                    {selected.disetujui_pada ? ` pada ${tanggal(selected.disetujui_pada)}` : ''}
                  </div>
                  {selected.catatan_admin && <div className="text-slate-600">Catatan: {selected.catatan_admin}</div>}
                  {selected.status === 'approved' && (
                    <div className="text-slate-500">
                      Perubahan lanjutan dilakukan di menu Hunian (Kost &amp; Sewa).
                    </div>
                  )}
                </div>
              )}

              {pesan && (
                <p
                  className={`p-3 rounded-lg text-[12px] font-medium ${
                    pesan.startsWith('Berhasil')
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-700'
                  }`}
                >
                  {pesan}
                </p>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-600 bg-white hover:bg-slate-50"
              >
                Tutup
              </button>
              {selected.status === 'pending' && (
                <div className="flex items-center gap-2">
                  {busy && progres && <span className="text-slate-500 text-[11px]">{progres}</span>}
                  <button
                    onClick={tolak}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-rose-300 text-rose-700 font-bold hover:bg-rose-50 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Tolak
                  </button>
                  <button
                    onClick={approve}
                    disabled={busy || !bisaApprove}
                    title={bisaApprove ? '' : 'Centang ketiga daftar periksa dan pastikan ada foto'}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Setujui
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}