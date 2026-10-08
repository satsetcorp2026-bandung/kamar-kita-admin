'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, RefreshCw, AlertTriangle, X, Trash2, Pencil } from 'lucide-react';

type Role = 'owner' | 'admin' | 'cs';
interface Staff { user_id: string; email: string | null; name: string | null; role: Role; created_at: string | null }

const CARD = 'bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]';
const GRAD = 'bg-gradient-to-b from-[#4a98ad] to-[#2f7088]';
const ROLE_LABEL: Record<Role, string> = { owner: 'Pemilik', admin: 'Admin', cs: 'CS' };
const ROLE_CHIP: Record<Role, string> = {
  owner: 'bg-amber-50 text-amber-800 border-amber-200',
  admin: 'bg-blue-50 text-blue-700 border-blue-200',
  cs: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function errText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Terjadi kesalahan.';
}

export default function StafPage() {
  const [list, setList] = useState<Staff[]>([]);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('cs');
  const [editing, setEditing] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const [l, u] = await Promise.all([supabase.rpc('admin_staff_list'), supabase.auth.getUser()]);
      if (!alive) return;
      if (l.error) {
        setError(l.error.message + ' Pastikan SQL Part AZ sudah dijalankan di Supabase SQL Editor.');
      } else {
        setList((l.data ?? []) as Staff[]);
        setError('');
      }
      setMe(u.data.user?.id ?? '');
      setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [reloadKey]);

  const reload = () => { setLoading(true); setReloadKey((k) => k + 1); };

  const call = async (fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError('');
    setOkMsg('');
    const { data, error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    const res = data as { success?: boolean; message?: string } | null;
    if (e) { setError(errText(e)); return false; }
    if (!res?.success) { setError(res?.message ?? 'Gagal.'); return false; }
    setOkMsg(done);
    reload();
    return true;
  };

  const add = async () => {
    if (!email.trim()) { setError('Isi email staf.'); return; }
    if (await call('admin_staff_add', { p_email: email, p_role: role }, 'Staf ditambahkan.')) setEmail('');
  };

  const changeRole = async (s: Staff, r: Role) => {
    if (r === s.role) return;
    if (!window.confirm(`Ubah peran ${s.name ?? s.email} dari ${ROLE_LABEL[s.role]} menjadi ${ROLE_LABEL[r]}?`)) return;
    await call('admin_staff_set_role', { p_user: s.user_id, p_role: r }, 'Peran diubah.');
  };

  const remove = async (s: Staff) => {
    if (!window.confirm(`Cabut akses dashboard untuk ${s.name ?? s.email}? Akun loginnya tidak dihapus, hanya aksesnya.`)) return;
    await call('admin_staff_remove', { p_user: s.user_id }, 'Akses dicabut.');
  };

  const saveName = async (s: Staff) => {
    if (await call('admin_staff_set_name', { p_user: s.user_id, p_name: nameDraft }, 'Nama disimpan.')) setEditing(null);
  };

  const input = 'w-full text-sm rounded-full border border-slate-200 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Staf dan Peran</h2>
          <p className="text-sm text-slate-500 mt-1">Atur siapa yang boleh masuk dashboard dan apa yang boleh mereka lakukan.</p>
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

      <section className={`${CARD} p-5`}>
        <h3 className="text-sm font-bold text-slate-800">Peran dan batasannya</h3>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                <th className="px-4 py-2 font-semibold">Peran</th>
                <th className="px-3 py-2 font-semibold">Boleh</th>
                <th className="px-4 py-2 font-semibold">Tidak boleh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              <tr>
                <td className="px-4 py-3"><span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${ROLE_CHIP.owner}`}>Pemilik</span></td>
                <td className="px-3 py-3 text-slate-600">Semua: tarif, keuangan, biaya, laporan investor, catatan aktivitas, dan kelola staf.</td>
                <td className="px-4 py-3 text-slate-500">Tidak ada. Selalu harus ada minimal satu Pemilik.</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${ROLE_CHIP.admin}`}>Admin</span></td>
                <td className="px-3 py-3 text-slate-600">Kerja harian: verifikasi dan kelola driver, top-up saldo, Sobat Tolongin, layanan, banner, notifikasi, laporan, SOS, pesanan.</td>
                <td className="px-4 py-3 text-slate-500">Mengubah tarif dan pengaturan, melihat keuangan, biaya, laporan investor, catatan aktivitas, mengelola staf.</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${ROLE_CHIP.cs}`}>CS</span></td>
                <td className="px-3 py-3 text-slate-600">Melihat pesanan, driver, dan peta. Menangani laporan pengguna dan SOS perjalanan.</td>
                <td className="px-4 py-3 text-slate-500">Semua yang berkaitan dengan uang, mengubah status atau dokumen driver, layanan lain, tarif, dan staf.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Jumlah orang per peran tidak dibatasi. Bisa ada beberapa Admin dan beberapa CS.</p>
      </section>

      <section className={`${CARD} p-5`}>
        <h3 className="text-sm font-bold text-slate-800">Tambah staf</h3>
        <ol className="list-decimal pl-5 mt-2 space-y-0.5 text-[13px] leading-relaxed text-slate-600">
          <li>Buka Supabase, menu <b>Authentication</b>, lalu <b>Users</b>, lalu <b>Add user</b>. Isi email dan kata sandi staf, dan centang konfirmasi email otomatis.</li>
          <li>Isi email yang sama di bawah ini, pilih perannya, lalu tekan Tambah.</li>
          <li>Berikan email dan kata sandinya kepada staf. Dia masuk lewat halaman login dashboard ini.</li>
        </ol>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2 items-end">
          <label className="text-xs font-semibold text-slate-700">Email staf
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="nama@email.com" className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-semibold text-slate-700">Peran
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={`${input} mt-1`}>
              <option value="cs">CS</option>
              <option value="admin">Admin</option>
              <option value="owner">Pemilik</option>
            </select>
          </label>
          <button onClick={add} disabled={busy} className={`px-6 py-2.5 rounded-full ${GRAD} text-white text-xs font-semibold shadow-md hover:opacity-90 disabled:opacity-60`}>
            {busy ? 'Memproses' : 'Tambah'}
          </button>
        </div>
      </section>

      <section className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-slate-100 text-sm font-bold text-slate-800">Daftar staf ({list.length})</div>
        {loading && list.length === 0 ? (
          <div className="py-16 flex justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : list.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Belum ada staf.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((s) => (
              <li key={s.user_id} className="px-5 py-3.5 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  {editing === s.user_id ? (
                    <div className="flex items-center gap-2">
                      <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={60} className={`${input} w-56`} autoFocus />
                      <button onClick={() => saveName(s)} disabled={busy} className={`px-4 py-1.5 rounded-full ${GRAD} text-white text-xs font-semibold disabled:opacity-60`}>Simpan</button>
                      <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600">Batal</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 truncate">{s.name ?? s.email ?? 'Tanpa nama'}</span>
                      {s.user_id === me && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">kamu</span>}
                      <button onClick={() => { setEditing(s.user_id); setNameDraft(s.name ?? ''); }} aria-label="Ubah nama" className="text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  <div className="text-xs text-slate-400">{s.email ?? '-'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`hidden sm:inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${ROLE_CHIP[s.role]}`}>{ROLE_LABEL[s.role]}</span>
                  <select
                    value={s.role}
                    disabled={busy}
                    onChange={(e) => changeRole(s, e.target.value as Role)}
                    className="text-xs rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700"
                  >
                    <option value="owner">Pemilik</option>
                    <option value="admin">Admin</option>
                    <option value="cs">CS</option>
                  </select>
                  {s.user_id !== me && (
                    <button onClick={() => remove(s)} disabled={busy} aria-label="Cabut akses" className="p-2 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Catatan: kunci peran berlaku di server untuk fungsi uang, tarif, driver, dan pengaturan. Halaman konten (Hunian, Jual Beli Kost, Preloved, Cleaning, Jasa Angkut, Banner) bagi CS hanya disembunyikan dari menu. Perubahan peran dan penambahan staf tercatat di Catatan Aktivitas.
      </p>
    </div>
  );
}