'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, X, Plus, Trash2, ArrowUp, ArrowDown, Edit, Eye } from 'lucide-react';

// ---------------------------------------------------------------------
// Konten Website: Admin menulis draf, hanya Pemilik yang menerbitkan.
// Konten yang terbit dibaca website Pimpim saat website dibangun ulang.
// ---------------------------------------------------------------------

interface Bidang {
  k: string; // nama kolom di data
  nama: string; // label di formulir
  bantuan?: string; // keterangan kecil di bawah kolom
  panjang?: boolean; // true = kotak teks besar
  maks: number; // batas jumlah huruf
  url?: boolean; // true = tautan (harus https:// atau dikosongkan)
  bawaan: string; // teks yang sekarang tampil di website
}

interface FaqItem {
  q: string;
  a: string;
}

interface DefBlok {
  kunci: string;
  judul: string;
  deskripsi: string;
  jenis: 'bidang' | 'faq';
  bidang?: Bidang[];
  faqBawaan?: FaqItem[];
  // ringkasan isi untuk kolom "Isi saat ini" di tabel
  ringkas: (n: Record<string, string>, f: FaqItem[]) => string;
}

interface Tayang {
  kunci: string;
  isi: Record<string, unknown>;
  diterbitkan_pada: string;
}

interface Draf {
  kunci: string;
  isi: Record<string, unknown>;
  status: 'draf' | 'menunggu';
  catatan: string | null;
  versi: number;
  diubah_pada: string;
  diajukan_pada: string | null;
}

type Kategori = 'tayang' | 'menunggu' | 'draf' | 'bawaan';
type Tab = 'semua' | Kategori;

const BLOK: DefBlok[] = [
  {
    kunci: 'beranda.hero',
    judul: 'Beranda: bagian atas',
    deskripsi: 'Lencana wilayah, judul besar, tombol unduh, dan catatan di bawah layar HP.',
    jenis: 'bidang',
    ringkas: (n) => `${n.judul ?? ''} ${n.sorot ?? ''}`.trim(),
    bidang: [
      { k: 'label', nama: 'Lencana wilayah', maks: 80, bawaan: 'Melayani Jatinangor, Cileunyi, Rancaekek, dan sekitarnya' },
      { k: 'judul', nama: 'Judul baris pertama', maks: 30, bawaan: 'Sepakat,' },
      { k: 'sorot', nama: 'Judul baris kedua (berwarna lebih terang)', maks: 30, bawaan: 'lalu jalan.' },
      { k: 'tombolSegera', nama: 'Tombol utama sebelum aplikasi rilis', maks: 40, bawaan: 'Segera hadir di Google Play' },
      { k: 'tombolRilis', nama: 'Tombol utama setelah aplikasi rilis', bantuan: 'Tampil kalau tautan Google Play sudah diisi.', maks: 40, bawaan: 'Unduh di Google Play' },
      { k: 'wilayahTanya', nama: 'Kalimat di bawah tombol', maks: 60, bawaan: 'Wilayahmu belum ada?' },
      { k: 'wilayahTautan', nama: 'Tulisan tautan WhatsApp', maks: 60, bawaan: 'Kabari kami lewat WhatsApp' },
      { k: 'catatan', nama: 'Catatan di bawah layar HP (bagian cara kerja)', panjang: true, maks: 200, bawaan: 'Coba tombol tambah dan kurang di layar HP ini. Begitulah cara menawar di aplikasi.' },
    ],
  },
  {
    kunci: 'beranda.unduh',
    judul: 'Beranda: banner unduh aplikasi',
    deskripsi: 'Banner biru di bagian paling bawah beranda. Ada dua versi: sebelum dan sesudah aplikasi rilis.',
    jenis: 'bidang',
    ringkas: (n) => n.judulSegera ?? '',
    bidang: [
      { k: 'judulSegera', nama: 'Judul sebelum rilis', maks: 60, bawaan: 'Sebentar lagi di Google Play.' },
      { k: 'isiSegera', nama: 'Penjelasan sebelum rilis', panjang: true, maks: 240, bawaan: 'Kami sedang menyiapkan rilis pertama. Hubungi admin, nanti kami kabari begitu aplikasinya bisa diunduh.' },
      { k: 'tombolSegera', nama: 'Tombol sebelum rilis (ke WhatsApp admin)', maks: 40, bawaan: 'Hubungi admin lewat WhatsApp' },
      { k: 'judulRilis', nama: 'Judul setelah rilis', maks: 60, bawaan: 'Unduh Pimpim sekarang.' },
      { k: 'isiRilis', nama: 'Penjelasan setelah rilis', panjang: true, maks: 240, bawaan: 'Gratis diunduh. Pesan ojek atau mobil dalam beberapa ketukan.' },
      { k: 'tombolRilis', nama: 'Tombol setelah rilis (ke Google Play)', maks: 40, bawaan: 'Unduh di Google Play' },
    ],
  },
  {
    kunci: 'situs.tautan',
    judul: 'Tautan unduh aplikasi',
    deskripsi: 'Mengisi tautan Google Play mengubah seluruh website dari "Segera hadir" menjadi "Unduh". Biarkan kosong sampai aplikasi benar-benar rilis.',
    jenis: 'bidang',
    ringkas: (n) => (n.playStoreUrl ? `Google Play: ${n.playStoreUrl}` : 'Google Play belum diisi (website menampilkan "Segera hadir")'),
    bidang: [
      { k: 'playStoreUrl', nama: 'Tautan Google Play', bantuan: 'Contoh: https://play.google.com/store/apps/details?id=id.pimpim.app. Kosong = website menampilkan "Segera hadir".', maks: 300, url: true, bawaan: '' },
      { k: 'appStoreUrl', nama: 'Tautan App Store', bantuan: 'Kosongkan kalau versi iPhone belum rilis.', maks: 300, url: true, bawaan: '' },
    ],
  },
  {
    kunci: 'bantuan.faq',
    judul: 'FAQ (tanya-jawab)',
    deskripsi: 'Daftar pertanyaan di halaman Bantuan. Bisa ditambah, diubah, dan diurutkan.',
    jenis: 'faq',
    ringkas: (_n, f) => `${f.length} pertanyaan`,
    faqBawaan: [
      { q: 'Di mana Pimpim bisa dipakai?', a: 'Saat ini di Jatinangor, Cileunyi, Rancaekek, dan sekitarnya. Tujuanmu boleh di mana saja, termasuk Bandung, selama ada driver di dekat titik jemputmu. Wilayah lain menyusul.' },
      { q: 'Bagaimana cara membayar?', a: 'Saat ini kamu membayar tunai langsung ke driver setelah sampai di tujuan.' },
      { q: 'Harganya benar-benar bisa ditawar?', a: 'Bisa. Aplikasi menampilkan harga wajar untuk jaraknya, lalu kamu boleh menaikkan atau menurunkan tawaran dalam batas yang adil bagi driver. Driver di sekitar yang menjawab, dan kamu yang memilih.' },
      { q: 'Bagaimana kalau terjadi sesuatu di perjalanan?', a: 'Selama perjalanan ada tombol SOS. Saat ditekan, posisimu terkirim ke tim Pimpim agar bisa segera ditindaklanjuti. Kamu juga bisa mengirim tautan pantau ke keluarga atau teman lewat WhatsApp, supaya mereka bisa melihat posisi driver selama perjalanan. Dalam keadaan yang mengancam nyawa, hubungi juga layanan darurat 112.' },
      { q: 'Bagaimana cara menjadi driver?', a: 'Daftar di aplikasi, unggah KTP, SIM, STNK, dan foto kendaraan. Tim kami memeriksa dokumenmu. Setelah disetujui, nyalakan status online dan mulai menjawab pesanan.' },
      { q: 'Bagaimana cara menghapus akun dan data saya?', a: 'Bisa langsung dari aplikasi: buka Profil lalu pilih Tutup akun. Kamu juga bisa meminta lewat halaman Hapus akun di situs ini. Rinciannya ada di Kebijakan Privasi.' },
    ],
  },
];

const teksDari = (v: unknown): string => (typeof v === 'string' ? v : '');

function bacaNilai(bidang: Bidang[], sumber: Record<string, unknown> | null): Record<string, string> {
  const hasil: Record<string, string> = {};
  for (const b of bidang) {
    const v = sumber ? sumber[b.k] : undefined;
    hasil[b.k] = typeof v === 'string' ? v : b.bawaan;
  }
  return hasil;
}

function bacaFaq(sumber: Record<string, unknown> | null, bawaan: FaqItem[]): FaqItem[] {
  const mentah = sumber ? sumber['daftar'] : null;
  if (!Array.isArray(mentah)) return bawaan.map((x) => ({ ...x }));
  const hasil: FaqItem[] = [];
  for (const it of mentah) {
    if (it && typeof it === 'object') {
      const o = it as Record<string, unknown>;
      hasil.push({ q: teksDari(o['q']), a: teksDari(o['a']) });
    }
  }
  return hasil.length > 0 ? hasil : bawaan.map((x) => ({ ...x }));
}

// Memeriksa isian. Mengembalikan pesan kesalahan, atau null kalau semuanya benar.
function periksa(def: DefBlok, nilai: Record<string, string>, faq: FaqItem[]): string | null {
  if (def.jenis === 'faq') {
    if (faq.length < 1) return 'Minimal harus ada 1 pertanyaan.';
    if (faq.length > 30) return 'Maksimal 30 pertanyaan.';
    for (let i = 0; i < faq.length; i++) {
      const q = faq[i].q.trim();
      const a = faq[i].a.trim();
      if (q.length < 3 || q.length > 200) return `Pertanyaan ${i + 1}: isi 3 sampai 200 huruf.`;
      if (a.length < 3 || a.length > 1500) return `Jawaban ${i + 1}: isi 3 sampai 1500 huruf.`;
    }
    return null;
  }
  for (const b of def.bidang ?? []) {
    const v = (nilai[b.k] ?? '').trim();
    if (b.url) {
      if (v.length > 0 && !/^https:\/\/\S+$/i.test(v)) return `${b.nama}: harus diawali https:// atau dikosongkan.`;
    } else if (v.length === 0) {
      return `${b.nama} tidak boleh kosong.`;
    }
    if (v.length > b.maks) return `${b.nama} maksimal ${b.maks} huruf.`;
  }
  return null;
}

function susunIsi(def: DefBlok, nilai: Record<string, string>, faq: FaqItem[]): Record<string, unknown> {
  if (def.jenis === 'faq') {
    return { daftar: faq.map((x) => ({ q: x.q.trim(), a: x.a.trim() })) };
  }
  const isi: Record<string, string> = {};
  for (const b of def.bidang ?? []) isi[b.k] = (nilai[b.k] ?? '').trim();
  return isi;
}

const tgl = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function KontenWebsitePage() {
  const [tayang, setTayang] = useState<Record<string, Tayang>>({});
  const [draf, setDraf] = useState<Record<string, Draf>>({});
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);
  const [notif, setNotif] = useState('');
  const [tab, setTab] = useState<Tab>('semua');

  const [kunciBuka, setKunciBuka] = useState<string | null>(null);
  const [nilai, setNilai] = useState<Record<string, string>>({});
  const [faq, setFaq] = useState<FaqItem[]>([]);
  const [awal, setAwal] = useState('');
  const [versiLokal, setVersiLokal] = useState<number | null>(null);
  const [catatanTolak, setCatatanTolak] = useState('');
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: 'ok' | 'salah'; teks: string } | null>(null);

  useEffect(() => {
    let aktif = true;

    async function muat() {
      setLoading(true);
      const [t, d, r] = await Promise.all([
        supabase.from('situs_konten').select('kunci, isi, diterbitkan_pada'),
        supabase.from('situs_konten_draf').select('kunci, isi, status, catatan, versi, diubah_pada, diajukan_pada'),
        supabase.rpc('my_admin_role'),
      ]);
      if (!aktif) return;
      if (t.error || d.error) {
        setLoadError(`Gagal memuat: ${t.error?.message ?? d.error?.message ?? 'tidak diketahui'}`);
      } else {
        setLoadError('');
        const petaT: Record<string, Tayang> = {};
        for (const x of (t.data ?? []) as Tayang[]) petaT[x.kunci] = x;
        const petaD: Record<string, Draf> = {};
        for (const x of (d.data ?? []) as Draf[]) petaD[x.kunci] = x;
        setTayang(petaT);
        setDraf(petaD);
      }
      // hanya Pemilik yang melihat tombol Terbitkan dan Tolak (server tetap yang memutuskan)
      setIsOwner(!r.error && r.data === 'owner');
      setLoading(false);
    }

    muat();
    return () => {
      aktif = false;
    };
  }, [tick]);

  const def = BLOK.find((b) => b.kunci === kunciBuka) ?? null;
  const kotor = def !== null && JSON.stringify({ n: nilai, f: faq }) !== awal;
  const adaDraf = versiLokal !== null;
  const drafAktif = def ? draf[def.kunci] : undefined;
  const menunggu = !!drafAktif && drafAktif.status === 'menunggu';
  const sudahTayang = def ? !!tayang[def.kunci] : false;
  const bisaTerbitkan = isOwner && (kotor || adaDraf || !sudahTayang);
  const bisaAjukan = !isOwner && (kotor || (adaDraf && !menunggu));

  const kategoriBlok = (kunci: string): Kategori => {
    const d = draf[kunci];
    if (d) return d.status === 'menunggu' ? 'menunggu' : 'draf';
    if (tayang[kunci]) return 'tayang';
    return 'bawaan';
  };
  const jumlahKat = (k: Kategori) => BLOK.filter((b) => kategoriBlok(b.kunci) === k).length;
  const jumlahTayang = BLOK.filter((b) => !!tayang[b.kunci]).length;
  const jumlahMenunggu = BLOK.filter((b) => draf[b.kunci]?.status === 'menunggu').length;
  const jumlahDitolak = BLOK.filter((b) => draf[b.kunci]?.status === 'draf' && !!draf[b.kunci]?.catatan).length;
  const tampil = tab === 'semua' ? BLOK : BLOK.filter((b) => kategoriBlok(b.kunci) === tab);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'semua', label: 'Semua', count: BLOK.length },
    { key: 'tayang', label: 'Tayang', count: jumlahKat('tayang') },
    { key: 'menunggu', label: 'Menunggu Pemilik', count: jumlahKat('menunggu') },
    { key: 'draf', label: 'Draf', count: jumlahKat('draf') },
    { key: 'bawaan', label: 'Teks bawaan', count: jumlahKat('bawaan') },
  ];

  const ringkasanSaatIni = (d: DefBlok): string => {
    const sumber = tayang[d.kunci] ? tayang[d.kunci].isi : null;
    const n = bacaNilai(d.bidang ?? [], sumber);
    const f = d.jenis === 'faq' ? bacaFaq(sumber, d.faqBawaan ?? []) : [];
    return d.ringkas(n, f);
  };

  const buka = (d: DefBlok) => {
    const dr = draf[d.kunci];
    const ty = tayang[d.kunci];
    const sumber = dr ? dr.isi : ty ? ty.isi : null;
    const n = bacaNilai(d.bidang ?? [], sumber);
    const f = d.jenis === 'faq' ? bacaFaq(sumber, d.faqBawaan ?? []) : [];
    setNilai(n);
    setFaq(f);
    setAwal(JSON.stringify({ n, f }));
    setVersiLokal(dr ? dr.versi : null);
    setCatatanTolak('');
    setPesan(null);
    setKunciBuka(d.kunci);
  };

  const tutup = () => {
    if (busy) return;
    setKunciBuka(null);
  };

  const muatUlang = () => setTick((x) => x + 1);

  // Menyimpan draf. Mengembalikan nomor versi draf, atau null kalau gagal.
  const simpanDraf = async (d: DefBlok): Promise<number | null> => {
    const salah = periksa(d, nilai, faq);
    if (salah) {
      setPesan({ jenis: 'salah', teks: salah });
      return null;
    }
    const { data, error } = await supabase
      .from('situs_konten_draf')
      .upsert({ kunci: d.kunci, isi: susunIsi(d, nilai, faq) }, { onConflict: 'kunci' })
      .select('versi')
      .single();
    if (error || !data) {
      setPesan({ jenis: 'salah', teks: `Gagal menyimpan draf: ${error?.message ?? 'tidak ada balasan'}` });
      return null;
    }
    const versi = (data as { versi: number }).versi;
    setVersiLokal(versi);
    setAwal(JSON.stringify({ n: nilai, f: faq }));
    return versi;
  };

  const klikSimpan = async (d: DefBlok) => {
    setBusy(true);
    setPesan(null);
    const v = await simpanDraf(d);
    setBusy(false);
    if (v !== null) {
      setPesan({ jenis: 'ok', teks: 'Draf tersimpan.' });
      muatUlang();
    }
  };

  const klikAjukan = async (d: DefBlok) => {
    setBusy(true);
    setPesan(null);
    const v = await simpanDraf(d);
    if (v === null) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.rpc('situs_ajukan', { p_kunci: d.kunci });
    setBusy(false);
    if (error) {
      setPesan({ jenis: 'salah', teks: `Gagal mengajukan: ${error.message}` });
      return;
    }
    setKunciBuka(null);
    setNotif('Diajukan. Pemilik akan meninjau dan menerbitkannya.');
    muatUlang();
  };

  const klikTerbitkan = async (d: DefBlok) => {
    if (!confirm(`Terbitkan "${d.judul}"? Tampil di website setelah website dibangun ulang dan diunggah.`)) return;
    setBusy(true);
    setPesan(null);
    // tidak ada perubahan baru dari Pemilik: pakai versi draf yang sedang dilihat
    let versi: number | null;
    if (versiLokal !== null && !kotor) versi = versiLokal;
    else versi = await simpanDraf(d);
    if (versi === null) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.rpc('situs_terbitkan', { p_kunci: d.kunci, p_versi: versi });
    setBusy(false);
    if (error) {
      setPesan({ jenis: 'salah', teks: `Gagal menerbitkan: ${error.message}` });
      return;
    }
    setKunciBuka(null);
    setNotif('Berhasil terbit. Agar tampil di website, bangun ulang website (npm run build) lalu unggah hasilnya.');
    muatUlang();
  };

  const klikTolak = async (d: DefBlok) => {
    if (!catatanTolak.trim()) {
      setPesan({ jenis: 'salah', teks: 'Isi catatan alasan penolakan dulu.' });
      return;
    }
    setBusy(true);
    setPesan(null);
    const { error } = await supabase.rpc('situs_tolak', { p_kunci: d.kunci, p_catatan: catatanTolak });
    setBusy(false);
    if (error) {
      setPesan({ jenis: 'salah', teks: `Gagal menolak: ${error.message}` });
      return;
    }
    setKunciBuka(null);
    setNotif('Pengajuan ditolak dan dikembalikan ke Admin beserta catatanmu.');
    muatUlang();
  };

  const klikBuang = async (d: DefBlok) => {
    if (!confirm('Buang draf ini? Perubahan yang belum terbit akan hilang.')) return;
    setBusy(true);
    setPesan(null);
    const { error } = await supabase.from('situs_konten_draf').delete().eq('kunci', d.kunci);
    setBusy(false);
    if (error) {
      setPesan({ jenis: 'salah', teks: `Gagal membuang draf: ${error.message}` });
      return;
    }
    setKunciBuka(null);
    muatUlang();
  };

  const ubahFaq = (i: number, kolom: 'q' | 'a', v: string) =>
    setFaq((prev) => prev.map((x, idx) => (idx === i ? { ...x, [kolom]: v } : x)));

  const pindahFaq = (i: number, arah: -1 | 1) =>
    setFaq((prev) => {
      const j = i + arah;
      if (j < 0 || j >= prev.length) return prev;
      const baru = [...prev];
      [baru[i], baru[j]] = [baru[j], baru[i]];
      return baru;
    });

  const hapusFaq = (i: number) => setFaq((prev) => prev.filter((_, idx) => idx !== i));
  const tambahFaq = () => setFaq((prev) => (prev.length >= 30 ? prev : [...prev, { q: '', a: '' }]));

  const statusBlok = (kunci: string): { label: string; kelas: string } => {
    const d = draf[kunci];
    if (d) {
      if (d.status === 'menunggu') return { label: 'Menunggu Pemilik', kelas: 'bg-amber-50 text-amber-700 border border-amber-200' };
      if (d.catatan) return { label: 'Ditolak', kelas: 'bg-rose-50 text-rose-700 border border-rose-200' };
      return { label: 'Draf', kelas: 'bg-blue-50 text-blue-700 border border-blue-200' };
    }
    if (tayang[kunci]) return { label: 'Tayang', kelas: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
    return { label: 'Teks bawaan', kelas: 'bg-slate-200/70 text-slate-700 border border-slate-200' };
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Konten Website</h2>
          <p className="text-sm text-slate-500 mt-1">
            Atur teks di website Pimpim. Admin menulis draf, Pemilik yang menerbitkan.
          </p>
        </div>
        <button
          onClick={muatUlang}
          className="self-start sm:self-auto px-4 py-2 rounded-full border border-slate-300 bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Muat ulang
        </button>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Blok konten', value: BLOK.length, sub: 'Bisa diatur dari sini', cls: 'from-[#d0dae6] to-[#b3c3d4]', num: 'text-slate-800' },
          { label: 'Tayang', value: jumlahTayang, sub: 'Sudah diterbitkan', cls: 'from-[#8fd0c8] to-[#62aea8]', num: 'text-[#0f2f2e]' },
          { label: 'Menunggu Pemilik', value: jumlahMenunggu, sub: 'Perlu disetujui', cls: 'from-[#f3e3b8] to-[#e4c985]', num: 'text-[#4a3a0c]' },
          { label: 'Ditolak', value: jumlahDitolak, sub: 'Perlu diperbaiki', cls: 'from-[#eaf3f9] to-[#cfe2ee]', num: 'text-rose-700' },
        ].map((k) => (
          <div
            key={k.label}
            className={`rounded-[20px] p-4 bg-gradient-to-br ${k.cls} shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]`}
          >
            <div className="text-[13px] font-bold text-slate-700">{k.label}</div>
            <div className={`text-3xl font-extrabold tabular-nums mt-1 ${k.num}`}>{loading ? '-' : k.value}</div>
            <div className="text-xs text-slate-600">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tab dan tabel */}
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

        {(notif || (isOwner && jumlahMenunggu > 0)) && (
          <div className="px-4 pt-4 space-y-2">
            {notif && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-800 flex items-start justify-between gap-3">
                <span>{notif}</span>
                <button onClick={() => setNotif('')} className="text-emerald-700 hover:text-emerald-900" aria-label="Tutup pemberitahuan">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {isOwner && jumlahMenunggu > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] font-medium text-amber-900">
                Ada {jumlahMenunggu} pengajuan yang menunggu persetujuanmu.
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-14 text-center text-slate-500 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Memuat konten
          </div>
        ) : loadError ? (
          <div className="py-14 text-center text-rose-600 text-sm px-6">{loadError}</div>
        ) : tampil.length === 0 ? (
          <div className="py-14 text-center text-slate-500 text-sm">Tidak ada blok konten di tab ini.</div>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/70 border-y border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-5">Blok</th>
                  <th className="py-3 px-4">Isi saat ini</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {tampil.map((b) => {
                  const st = statusBlok(b.kunci);
                  const dr = draf[b.kunci];
                  const ty = tayang[b.kunci];
                  const tinjau = isOwner && dr?.status === 'menunggu';
                  return (
                    <tr key={b.kunci} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-5 align-top">
                        <div className="font-bold text-slate-900 text-sm">{b.judul}</div>
                        <div className="text-[12px] text-slate-500 mt-0.5 max-w-md leading-relaxed">{b.deskripsi}</div>
                      </td>
                      <td className="py-3.5 px-4 align-top max-w-[260px]">
                        <div className="text-[13px] font-semibold text-slate-800 truncate">{ringkasanSaatIni(b)}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {ty ? `Terbit ${tgl(ty.diterbitkan_pada)}` : 'Belum pernah diterbitkan'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <span className={`inline-block text-[11px] px-2.5 py-1 rounded-full font-bold ${st.kelas}`}>{st.label}</span>
                        {dr && <div className="text-[11px] text-slate-500 mt-1">Draf diubah {tgl(dr.diubah_pada)}</div>}
                        {dr && dr.status === 'draf' && dr.catatan && (
                          <div className="text-[11px] text-rose-700 mt-1 max-w-[220px] whitespace-normal leading-snug">
                            Catatan: {dr.catatan}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap align-top">
                        <button
                          onClick={() => buka(b)}
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
                            tinjau
                              ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {tinjau ? <Eye className="w-3.5 h-3.5" /> : <Edit className="w-3.5 h-3.5" />}
                          {tinjau ? 'Tinjau' : 'Ubah'}
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
          Konten yang sudah terbit baru tampil di website setelah website dibangun ulang (npm run build) dan diunggah.
          Draf tidak pernah terlihat oleh pengunjung.
        </div>
      </section>

      {def && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm leading-tight">{def.judul}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{def.deskripsi}</p>
              </div>
              <button onClick={tutup} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {menunggu && (
                <p className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                  {isOwner
                    ? 'Admin mengajukan perubahan ini. Periksa isinya, lalu Terbitkan atau Tolak.'
                    : 'Sudah diajukan dan menunggu Pemilik. Kalau kamu mengubah isinya lagi, pengajuan batal dan harus diajukan ulang.'}
                </p>
              )}
              {drafAktif && drafAktif.status === 'draf' && drafAktif.catatan && (
                <p className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                  Catatan Pemilik: {drafAktif.catatan}
                </p>
              )}

              {def.jenis === 'bidang' &&
                (def.bidang ?? []).map((b) => {
                  const v = nilai[b.k] ?? '';
                  return (
                    <div key={b.k}>
                      <label className="font-semibold text-slate-700 block mb-1">{b.nama}</label>
                      {b.panjang ? (
                        <textarea
                          rows={3}
                          value={v}
                          maxLength={b.maks}
                          onChange={(e) => setNilai((prev) => ({ ...prev, [b.k]: e.target.value }))}
                          className="w-full p-2 border rounded-lg focus:outline-blue-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={v}
                          maxLength={b.maks}
                          onChange={(e) => setNilai((prev) => ({ ...prev, [b.k]: e.target.value }))}
                          className={`w-full p-2 border rounded-lg focus:outline-blue-500 ${b.url ? 'font-mono' : ''}`}
                        />
                      )}
                      <div className="flex justify-between gap-3 mt-1 text-[11px] text-slate-500">
                        <span>{b.bantuan ?? ''}</span>
                        <span className="shrink-0 tabular-nums">
                          {v.length}/{b.maks}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {def.jenis === 'faq' && (
                <div className="space-y-3">
                  {faq.map((it, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500">Pertanyaan {i + 1}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => pindahFaq(i, -1)}
                            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                            aria-label="Naikkan"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={i === faq.length - 1}
                            onClick={() => pindahFaq(i, 1)}
                            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                            aria-label="Turunkan"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => hapusFaq(i)}
                            className="p-1.5 rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                            aria-label="Hapus pertanyaan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={it.q}
                        maxLength={200}
                        placeholder="Pertanyaan"
                        onChange={(e) => ubahFaq(i, 'q', e.target.value)}
                        className="w-full p-2 border rounded-lg focus:outline-blue-500 font-semibold"
                      />
                      <textarea
                        rows={3}
                        value={it.a}
                        maxLength={1500}
                        placeholder="Jawaban"
                        onChange={(e) => ubahFaq(i, 'a', e.target.value)}
                        className="w-full p-2 border rounded-lg focus:outline-blue-500"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={tambahFaq}
                    disabled={faq.length >= 30}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-300 bg-blue-50/60 text-blue-700 font-bold hover:bg-blue-50 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah pertanyaan
                  </button>
                </div>
              )}

              {isOwner && menunggu && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Catatan penolakan (wajib kalau menolak)</label>
                  <textarea
                    rows={2}
                    value={catatanTolak}
                    onChange={(e) => setCatatanTolak(e.target.value)}
                    className="w-full p-2 border rounded-lg focus:outline-blue-500"
                  />
                </div>
              )}

              {pesan && (
                <p
                  className={`p-3 rounded-lg text-[12px] font-medium ${
                    pesan.jenis === 'ok'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-700'
                  }`}
                >
                  {pesan.teks}
                </p>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
              <div className="flex items-center gap-2">
                <button
                  onClick={tutup}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50"
                >
                  Tutup
                </button>
                {adaDraf && (
                  <button
                    onClick={() => klikBuang(def)}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg text-[12px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Buang draf
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => klikSimpan(def)}
                  disabled={busy || !kotor}
                  className="px-4 py-2 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Simpan draf
                </button>
                {isOwner && menunggu && (
                  <button
                    onClick={() => klikTolak(def)}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-white border border-rose-300 text-rose-700 font-bold hover:bg-rose-50 disabled:opacity-50"
                  >
                    Tolak
                  </button>
                )}
                {isOwner ? (
                  <button
                    onClick={() => klikTerbitkan(def)}
                    disabled={busy || !bisaTerbitkan}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Terbitkan
                  </button>
                ) : (
                  <button
                    onClick={() => klikAjukan(def)}
                    disabled={busy || !bisaAjukan}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ajukan terbit
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}