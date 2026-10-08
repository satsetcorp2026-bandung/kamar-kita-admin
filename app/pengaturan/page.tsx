'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, RefreshCw, AlertTriangle, X, RotateCcw } from 'lucide-react';

interface SettingRow { key: string; value: string; updated_at: string | null; updated_by_name: string | null }
interface HistRow { key: string; old: string | null; new: string | null; at: string; admin_name: string | null }

type Unit = 'rp' | 'km' | 'pct' | 'x' | 'switch' | 'num';
interface FieldDef { key: string; label: string; hint?: string; unit: Unit; def: string }
interface GroupDef { title: string; desc: string; fields: FieldDef[]; note?: string }

const GROUPS: GroupDef[] = [
  {
    title: 'Tarif Pim Ride (motor)',
    desc: 'Tarif rekomendasi sistem. Penumpang menawar di sekitar angka ini.',
    fields: [
      { key: 'fare_ride_base1', label: 'Tarif tahap 1', hint: 'Sampai batas jarak tahap 1', unit: 'rp', def: '8000' },
      { key: 'fare_ride_base2', label: 'Tarif tahap 2', hint: 'Sampai batas jarak tahap 2', unit: 'rp', def: '11000' },
      { key: 'fare_ride_per_km', label: 'Tambahan per km', hint: 'Untuk jarak di atas tahap 2', unit: 'rp', def: '2250' },
    ],
  },
  {
    title: 'Tarif Pim Car (mobil)',
    desc: 'Pim Car kecil. Kelas besar dihitung dari pengali di bawah.',
    fields: [
      { key: 'fare_car_base1', label: 'Tarif tahap 1', hint: 'Sampai batas jarak tahap 1', unit: 'rp', def: '14000' },
      { key: 'fare_car_base2', label: 'Tarif tahap 2', hint: 'Sampai batas jarak tahap 2', unit: 'rp', def: '18000' },
      { key: 'fare_car_per_km', label: 'Tambahan per km', hint: 'Untuk jarak di atas tahap 2', unit: 'rp', def: '4000' },
      { key: 'car_large_multiplier', label: 'Pengali kelas besar', hint: '1,2 artinya 20 persen lebih mahal', unit: 'x', def: '1.2' },
    ],
  },
  {
    title: 'Batas jarak tarif',
    desc: 'Jarak yang memisahkan tahap 1, tahap 2, dan tambahan per km (berlaku untuk motor dan mobil).',
    fields: [
      { key: 'fare_tier1_km', label: 'Batas tahap 1', unit: 'km', def: '2.0' },
      { key: 'fare_tier2_km', label: 'Batas tahap 2', unit: 'km', def: '4.0' },
    ],
  },
  {
    title: 'Tawar-menawar',
    desc: 'Rentang tawaran penumpang dan driver dibanding tarif rekomendasi.',
    note: 'Aplikasi HP membatasi tawaran dengan angka yang tertanam di aplikasi. Kalau batas bawah dinaikkan atau batas atas diturunkan, tawaran di ujung rentang bisa ditolak server sampai aplikasi diperbarui. Memperlebar rentang aman.',
    fields: [
      { key: 'bargain_min_pct', label: 'Batas bawah', hint: '85 artinya boleh turun 15 persen', unit: 'pct', def: '85' },
      { key: 'bargain_max_pct', label: 'Batas atas', hint: '125 artinya boleh naik 25 persen', unit: 'pct', def: '125' },
    ],
  },
  {
    title: 'Komisi dan biaya platform',
    desc: 'Komisi dipotong dari saldo driver. Biaya platform dibayar penumpang dan dipotong dari saldo driver.',
    fields: [
      { key: 'commission_pct', label: 'Komisi', hint: 'Persen dari harga kesepakatan', unit: 'pct', def: '10' },
      { key: 'commission_min_km', label: 'Komisi berlaku di atas', hint: 'Trip sampai jarak ini bebas komisi', unit: 'km', def: '2.0' },
      { key: 'platform_fee', label: 'Biaya platform', hint: 'Per trip selesai', unit: 'rp', def: '1000' },
    ],
  },
  {
    title: 'Harga Sobat Tolongin',
    desc: 'Harga per bulan. Berlaku untuk langganan atau lencana yang dicatat setelah perubahan.',
    fields: [
      { key: 'tolongin_sub_price', label: 'Langganan per bulan', unit: 'rp', def: '20000' },
      { key: 'tolongin_badge_price', label: 'Lencana Terbaik per bulan', unit: 'rp', def: '10000' },
    ],
  },
  {
    title: 'Pagar biaya peta',
    desc: 'Rute jalan memakai Google Maps yang berbayar. Matikan saklar untuk menghentikan permintaan rute seketika.',
    fields: [
      { key: 'routes_enabled', label: 'Rute jalan asli', hint: 'Mati: aplikasi memakai garis lurus', unit: 'switch', def: 'true' },
      { key: 'routes_daily_limit', label: 'Batas permintaan per hari', unit: 'num', def: '300' },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((g) => g.fields);
const LABEL: Record<string, string> = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.label]));

const TINT = 'shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]';
const CARD = 'bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]';
const GRAD = 'bg-gradient-to-b from-[#4a98ad] to-[#2f7088]';

function rp(n: number) {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n));
}
function num(v: string | undefined, d: number) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : d;
}
function same(a: string | undefined, b: string | undefined) {
  if (a === b) return true;
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && String(a).trim() !== '' && String(b).trim() !== '' && x === y;
}
function fmtVal(key: string, v: string | null) {
  if (v === null || v === undefined) return '-';
  const f = ALL_FIELDS.find((x) => x.key === key);
  if (!f) return v;
  if (f.unit === 'switch') return v === 'true' ? 'Aktif' : 'Mati';
  if (f.unit === 'rp') return rp(num(v, 0));
  if (f.unit === 'km') return num(v, 0) + ' km';
  if (f.unit === 'pct') return num(v, 0) + '%';
  if (f.unit === 'x') return num(v, 0) + 'x';
  return v;
}
function fmtDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function errText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Terjadi kesalahan.';
}

export default function PengaturanPage() {
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, SettingRow>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<HistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const [g, h] = await Promise.all([supabase.rpc('admin_settings_get'), supabase.rpc('admin_settings_history')]);
      if (!alive) return;
      if (g.error) {
        setError(g.error.message + ' Pastikan SQL Part AX sudah dijalankan di Supabase SQL Editor.');
        setLoading(false);
        return;
      }
      const rows = (g.data ?? []) as SettingRow[];
      const s: Record<string, string> = {};
      const m: Record<string, SettingRow> = {};
      rows.forEach((r) => { s[r.key] = r.value; m[r.key] = r; });
      ALL_FIELDS.forEach((f) => { if (s[f.key] === undefined) s[f.key] = f.def; });
      setSaved(s);
      setMeta(m);
      setDraft(s);
      setHist(((h.data ?? []) as HistRow[]));
      setError('');
      setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [reloadKey]);

  const changed = useMemo(
    () => ALL_FIELDS.filter((f) => !same(draft[f.key], saved[f.key])).map((f) => f.key),
    [draft, saved]
  );

  const set = (k: string, v: string) => { setOkMsg(''); setDraft((d) => ({ ...d, [k]: v })); };

  const submit = async () => {
    if (changed.length === 0) return;
    const lines = changed.map((k) => `${LABEL[k]}: ${fmtVal(k, saved[k])} menjadi ${fmtVal(k, draft[k])}`).join('\n');
    if (!window.confirm(`Simpan perubahan ini?\n\n${lines}\n\nHanya berlaku untuk pesanan baru.`)) return;
    setSaving(true);
    setError('');
    const payload: Record<string, string> = {};
    changed.forEach((k) => { payload[k] = String(draft[k]).trim().replace(',', '.'); });
    const { error: e } = await supabase.rpc('admin_settings_save', { p_changes: payload });
    setSaving(false);
    if (e) { setError(errText(e)); return; }
    setOkMsg('Tersimpan. Berlaku untuk pesanan baru.');
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  // Simulasi tarif dari angka yang sedang diisi (rumus sama dengan server)
  const sim = useMemo(() => {
    const g = (k: string) => num(draft[k], num(saved[k], 0));
    const t1 = g('fare_tier1_km');
    const t2 = g('fare_tier2_km');
    const fare = (km: number, car: boolean, large: boolean) => {
      const b1 = g(car ? 'fare_car_base1' : 'fare_ride_base1');
      const b2 = g(car ? 'fare_car_base2' : 'fare_ride_base2');
      const pk = g(car ? 'fare_car_per_km' : 'fare_ride_per_km');
      let v = km <= t1 ? b1 : km <= t2 ? b2 : b2 + (km - t2) * pk;
      v = Math.round(v);
      if (car && large) v = Math.round(v * g('car_large_multiplier'));
      return v;
    };
    const lo = g('bargain_min_pct') / 100;
    const hi = g('bargain_max_pct') / 100;
    const cp = g('commission_pct') / 100;
    const cmin = g('commission_min_km');
    const pf = g('platform_fee');
    return [1.5, 3, 5, 8, 12].map((km) => {
      const ride = fare(km, false, false);
      return {
        km,
        ride,
        car: fare(km, true, false),
        large: fare(km, true, true),
        lo: Math.round(ride * lo),
        hi: Math.round(ride * hi),
        driverCut: (km > cmin ? Math.round(ride * cp) : 0) + pf,
      };
    });
  }, [draft, saved]);

  const input = 'w-full text-sm rounded-full border border-slate-200 bg-white py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 tabular-nums';

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-24">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Pengaturan Tarif</h2>
          <p className="text-sm text-slate-500 mt-1">Atur tarif, tawar-menawar, komisi, biaya platform, dan harga langganan tanpa mengubah kode.</p>
        </div>
        <button
          onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] text-xs font-semibold text-slate-700 hover:bg-white w-fit"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Muat ulang
        </button>
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900 leading-relaxed">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Perubahan hanya berlaku untuk pesanan baru. Pesanan yang sudah berjalan tetap memakai angka lama. Setiap perubahan tercatat bersama nama admin.</span>
      </div>

      <section className={`${CARD} p-5`}>
        <h3 className="text-sm font-bold text-slate-800">Panduan singkat</h3>
        <p className="text-xs text-slate-500 mt-0.5">Klik judul untuk membuka. Semua contoh memakai angka awal.</p>
        <div className="mt-3 divide-y divide-slate-100 text-sm text-slate-700">
          <details open className="py-2.5 group">
            <summary className="cursor-pointer font-semibold text-slate-800">Cara mengubah angka</summary>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-[13px] leading-relaxed text-slate-600">
              <li>Ubah angka di kotak yang kamu mau. Kotak yang berubah akan berwarna biru.</li>
              <li>Lihat tabel <b>Simulasi</b> di bawah untuk memastikan hasilnya masuk akal.</li>
              <li>Tekan <b>Simpan perubahan</b> di bar bawah, lalu tekan OK pada pertanyaan konfirmasi.</li>
              <li>Selesai. Pesanan baru langsung memakai angka baru. Pesanan yang sudah berjalan tidak ikut berubah.</li>
            </ol>
            <p className="text-[13px] text-slate-600 mt-2">Salah ubah? Tekan tombol kecil <b>awal ...</b> di samping nama isian untuk kembali ke angka awal, atau tekan <b>Batalkan</b> sebelum menyimpan.</p>
          </details>
          <details className="py-2.5">
            <summary className="cursor-pointer font-semibold text-slate-800">Cara kerja tarif (3 tahap)</summary>
            <div className="mt-2 text-[13px] leading-relaxed text-slate-600 space-y-1.5">
              <p>Tarif dibagi menurut jarak. Contoh Pim Ride dengan angka awal:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Sampai 2 km: Rp8.000 (tarif tahap 1)</li>
                <li>Lebih dari 2 km sampai 4 km: Rp11.000 (tarif tahap 2)</li>
                <li>Lebih dari 4 km: Rp11.000 ditambah Rp2.250 untuk setiap km di atas 4 km</li>
              </ul>
              <p>Jadi perjalanan 6 km = Rp11.000 + (2 km x Rp2.250) = <b>Rp15.500</b>.</p>
              <p>Pim Car caranya sama. Untuk mobil kelas besar, hasilnya dikalikan pengali (1,2 artinya 20 persen lebih mahal).</p>
              <p>Angka 2 km dan 4 km bisa diubah di kotak <b>Batas jarak tarif</b>. Batas tahap 2 harus lebih besar dari tahap 1.</p>
            </div>
          </details>
          <details className="py-2.5">
            <summary className="cursor-pointer font-semibold text-slate-800">Tawar-menawar</summary>
            <div className="mt-2 text-[13px] leading-relaxed text-slate-600 space-y-1.5">
              <p>Tarif di atas adalah tarif rekomendasi. Penumpang dan driver boleh menawar di sekitarnya.</p>
              <p><b>Batas bawah 85</b> artinya boleh turun sampai 85 persen (turun 15 persen). <b>Batas atas 125</b> artinya boleh naik sampai 125 persen (naik 25 persen).</p>
              <p>Contoh tarif Rp10.000: tawaran boleh antara Rp8.500 sampai Rp12.500.</p>
              <p className="text-amber-800">Hati-hati: untuk sementara jangan mempersempit rentang (jangan menaikkan batas bawah atau menurunkan batas atas), karena aplikasi HP masih memakai batas lama. Memperlebar rentang aman.</p>
            </div>
          </details>
          <details className="py-2.5">
            <summary className="cursor-pointer font-semibold text-slate-800">Komisi dan biaya platform</summary>
            <div className="mt-2 text-[13px] leading-relaxed text-slate-600 space-y-1.5">
              <p>Keduanya dipotong otomatis dari <b>saldo driver</b> saat trip selesai. Penumpang tetap membayar tunai ke driver sesuai harga kesepakatan.</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li><b>Komisi</b>: persen dari harga kesepakatan, hanya untuk trip yang lebih jauh dari batas jarak komisi (awal 2 km). Trip sampai 2 km bebas komisi.</li>
                <li><b>Biaya platform</b>: nominal tetap per trip selesai (awal Rp1.000), berlaku untuk semua trip.</li>
              </ul>
              <p>Contoh trip 3 km dengan harga Rp12.000: komisi 10 persen = Rp1.200, ditambah biaya platform Rp1.000, jadi saldo driver berkurang <b>Rp2.200</b>. Trip 1,5 km hanya kena Rp1.000.</p>
            </div>
          </details>
          <details className="py-2.5">
            <summary className="cursor-pointer font-semibold text-slate-800">Harga Sobat Tolongin</summary>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">Harga langganan dan lencana Terbaik per bulan. Angka baru dipakai saat kamu mengaktifkan langganan atau lencana berikutnya di halaman Sobat Tolongin. Yang sudah tercatat di Keuangan tidak berubah.</p>
          </details>
          <details className="py-2.5">
            <summary className="cursor-pointer font-semibold text-slate-800">Pagar biaya peta (saklar darurat)</summary>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">Rute jalan di aplikasi memakai Google Maps yang berbayar per permintaan. Kalau tagihan mulai naik atau ada yang aneh, ubah <b>Rute jalan asli</b> menjadi Mati lalu simpan. Aplikasi akan memakai garis lurus (gratis) sampai kamu menyalakannya lagi. <b>Batas permintaan per hari</b> adalah pagar otomatis: kalau sudah tercapai, permintaan rute berhenti sampai besok.</p>
          </details>
          <details className="py-2.5">
            <summary className="cursor-pointer font-semibold text-slate-800">Tips supaya aman</summary>
            <ul className="list-disc pl-5 mt-2 space-y-0.5 text-[13px] leading-relaxed text-slate-600">
              <li>Ubah satu kelompok dulu, lihat hasilnya di beberapa pesanan, baru ubah yang lain.</li>
              <li>Cek tabel Simulasi sebelum menyimpan. Pastikan tarif jarak dekat dan jauh masih wajar.</li>
              <li>Tarif terlalu murah membuat driver rugi dan malas narik. Komisi terlalu besar membuat driver pindah ke aplikasi lain.</li>
              <li>Kalau mengubah tarif saat jam ramai, pesanan yang sedang mencari driver tetap memakai tarif lama.</li>
              <li>Semua perubahan tercatat di Riwayat perubahan di bagian bawah halaman, lengkap dengan nama admin.</li>
            </ul>
          </details>
        </div>
      </section>

      {error && (
        <div className="flex items-start justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-2xl px-4 py-3">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
      )}
      {okMsg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-2xl px-4 py-3">{okMsg}</div>}

      {loading && Object.keys(saved).length === 0 ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />Memuat pengaturan</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {GROUPS.map((g) => (
              <section key={g.title} className={`${CARD} p-5`}>
                <h3 className="text-sm font-bold text-slate-800">{g.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{g.desc}</p>
                {g.note && <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3 leading-relaxed">{g.note}</p>}
                <div className="mt-4 space-y-3">
                  {g.fields.map((f) => {
                    const dirty = !same(draft[f.key], saved[f.key]);
                    const m = meta[f.key];
                    return (
                      <div key={f.key}>
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-semibold text-slate-700" htmlFor={f.key}>{f.label}</label>
                          {!same(draft[f.key], f.def) && (
                            <button onClick={() => set(f.key, f.def)} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700" title="Kembalikan ke angka awal">
                              <RotateCcw className="w-3 h-3" />awal {fmtVal(f.key, f.def)}
                            </button>
                          )}
                        </div>
                        {f.unit === 'switch' ? (
                          <button
                            id={f.key}
                            onClick={() => set(f.key, draft[f.key] === 'true' ? 'false' : 'true')}
                            className={`mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border ${draft[f.key] === 'true' ? `${GRAD} text-white border-transparent shadow-md` : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                          >
                            {draft[f.key] === 'true' ? 'Aktif' : 'Mati'}
                          </button>
                        ) : (
                          <div className="relative mt-1">
                            {f.unit === 'rp' && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>}
                            <input
                              id={f.key}
                              value={draft[f.key] ?? ''}
                              onChange={(e) => set(f.key, e.target.value.replace(/[^0-9.,]/g, ''))}
                              inputMode="decimal"
                              className={`${input} ${f.unit === 'rp' ? 'pl-10' : 'pl-4'} pr-12 ${dirty ? 'border-blue-400 bg-blue-50/40' : ''}`}
                            />
                            {f.unit !== 'rp' && f.unit !== 'num' && (
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">{f.unit === 'pct' ? '%' : f.unit === 'km' ? 'km' : 'x'}</span>
                            )}
                          </div>
                        )}
                        {f.hint && <p className="text-[11px] text-slate-400 mt-1">{f.hint}</p>}
                        {m?.updated_at && <p className="text-[11px] text-slate-400">Diubah {fmtDate(m.updated_at)}{m.updated_by_name ? ` oleh ${m.updated_by_name}` : ''}</p>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <section className={`${CARD} p-5`}>
            <h3 className="text-sm font-bold text-slate-800">Simulasi dengan angka yang sedang diisi</h3>
            <p className="text-xs text-slate-500 mt-0.5">Untuk memastikan hasilnya masuk akal sebelum disimpan. Angka di sini belum berlaku sampai kamu menyimpan.</p>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                    <th className="px-4 py-2 font-semibold">Jarak</th>
                    <th className="px-3 py-2 font-semibold text-right">Pim Ride</th>
                    <th className="px-3 py-2 font-semibold text-right">Rentang tawar Ride</th>
                    <th className="px-3 py-2 font-semibold text-right">Pim Car</th>
                    <th className="px-3 py-2 font-semibold text-right">Car besar</th>
                    <th className="px-4 py-2 font-semibold text-right">Potongan saldo driver (Ride)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sim.map((r) => (
                    <tr key={r.km}>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{r.km} km</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rp(r.ride)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{rp(r.lo)} sampai {rp(r.hi)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rp(r.car)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rp(r.large)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{rp(r.driverCut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${CARD} p-5`}>
            <h3 className="text-sm font-bold text-slate-800">Riwayat perubahan</h3>
            {hist.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">Belum ada perubahan lewat halaman ini.</p>
            ) : (
              <ul className="divide-y divide-slate-100 mt-2">
                {hist.map((h, i) => (
                  <li key={i} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{LABEL[h.key] ?? h.key}</p>
                      <p className="text-xs text-slate-500">{fmtVal(h.key, h.old)} menjadi {fmtVal(h.key, h.new)}</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-400 shrink-0">
                      <p>{fmtDate(h.at)}</p>
                      <p>{h.admin_name ?? '-'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {changed.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,640px)]">
          <div className={`rounded-full bg-white/95 backdrop-blur ${TINT} px-5 py-3 flex items-center justify-between gap-3`}>
            <span className="text-sm text-slate-700">{changed.length} perubahan belum disimpan</span>
            <div className="flex gap-2">
              <button onClick={() => setDraft(saved)} className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">Batalkan</button>
              <button
                onClick={submit}
                disabled={saving}
                className={`px-5 py-2 rounded-full ${GRAD} text-white text-xs font-semibold shadow-md hover:opacity-90 disabled:opacity-60`}
              >
                {saving ? 'Menyimpan' : 'Simpan perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}