'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import { Search, RefreshCw, Phone, MapPin, Trash2, Radio, AlertTriangle, X, Loader2, BadgeCheck, Clock } from 'lucide-react';

interface SosVolunteer {
  id: string;
  name: string;
  phone: string;
  profession: string;
  posko_name: string | null;
  avatar_url: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  is_verified: boolean | null;
  source: string;
  created_at: string;
}

const D3 = 'shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]';
const CARD = 'bg-white/80 backdrop-blur border border-white rounded-3xl shadow-[0_10px_28px_-14px_rgba(60,80,130,0.35)]';

function errText(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Terjadi kesalahan.';
}

export default function RelawanSosPage() {
  const [items, setItems] = useState<SosVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { data, error: e } = await supabase
        .from('sos_volunteers')
        .select('*')
        .order('created_at', { ascending: false });
      if (!alive) return;
      if (e) setError('Gagal memuat relawan: ' + e.message);
      else { setItems((data ?? []) as SosVolunteer[]); setError(''); }
      setLoading(false);
    };
    run();
    return () => { alive = false; };
  }, [reloadKey]);

  const reload = () => { setLoading(true); setReloadKey((k) => k + 1); };

  const toggle = async (id: string, current: boolean) => {
    const { error: e } = await supabase.from('sos_volunteers').update({ is_active: !current }).eq('id', id);
    if (e) { setError(errText(e)); return; }
    setItems((prev) => prev.map((v) => (v.id === id ? { ...v, is_active: !current } : v)));
  };

  const verify = async (id: string, approve: boolean) => {
    const { error: e } = await supabase.rpc('admin_sos_volunteer_verify', { p_id: id, p_approve: approve });
    if (e) { setError(errText(e)); return; }
    setItems((prev) => prev.map((v) => (v.id === id ? { ...v, is_verified: approve } : v)));
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Hapus relawan "${name}" dari sistem?`)) return;
    const { error: e } = await supabase.from('sos_volunteers').delete().eq('id', id);
    if (e) { setError(errText(e)); return; }
    setItems((prev) => prev.filter((v) => v.id !== id));
  };

  const q = search.toLowerCase();
  // yang menunggu verifikasi ditaruh paling atas
  const filtered = items
    .filter((v) =>
      (v.name || '').toLowerCase().includes(q) ||
      (v.profession || '').toLowerCase().includes(q) ||
      (v.posko_name || '').toLowerCase().includes(q) ||
      (v.phone || '').includes(search)
    )
    .sort((a, b) => Number(a.is_verified !== false) - Number(b.is_verified !== false));

  const stats = useMemo(() => ({
    total: items.length,
    aktif: items.filter((v) => v.is_active && v.is_verified !== false).length,
    menunggu: items.filter((v) => v.is_verified === false).length,
    tolongin: items.filter((v) => v.source === 'tolongin').length,
  }), [items]);

  const kpis = [
    { label: 'Total relawan', value: stats.total, tint: 'bg-gradient-to-br from-[#e3ecfb] to-[#cddcf5]', text: 'text-[#27468c]' },
    { label: 'Aktif di radar', value: stats.aktif, tint: 'bg-gradient-to-br from-[#dcf3ea] to-[#bfe5d6]', text: 'text-[#1d6a50]' },
    { label: 'Menunggu verifikasi', value: stats.menunggu, tint: 'bg-gradient-to-br from-[#fff1d6] to-[#fbdca0]', text: 'text-[#8a5a00]' },
    { label: 'Dari Sobat Tolongin', value: stats.tolongin, tint: 'bg-gradient-to-br from-[#fdeedb] to-[#f7d9b4]', text: 'text-[#8a5314]' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Relawan Siaga SOS</h2>
          <p className="text-sm text-slate-500 mt-1">Petugas, tenaga medis, dan relawan warga yang terhubung ke radar darurat. Pendaftar mandiri tampil di radar setelah kamu setujui.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, profesi, posko"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white rounded-full border border-slate-200 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <button onClick={reload} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-[0_6px_16px_-8px_rgba(60,80,130,0.35)] text-xs font-semibold text-slate-700 hover:bg-white">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Muat ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-2xl px-4 py-3">
          <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</span>
          <button onClick={() => setError('')} aria-label="Tutup"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${k.tint} ${D3} rounded-3xl p-4`}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</div>
            <div className={`text-3xl font-extrabold mt-1 ${k.text}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                <th className="py-3 px-4 font-semibold">Relawan</th>
                <th className="py-3 px-3 font-semibold">Profesi</th>
                <th className="py-3 px-3 font-semibold">Posko</th>
                <th className="py-3 px-3 font-semibold">Koordinat</th>
                <th className="py-3 px-3 font-semibold">Asal data</th>
                <th className="py-3 px-3 font-semibold text-center">Verifikasi</th>
                <th className="py-3 px-3 font-semibold text-center">Radar</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading && items.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-14 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">Tidak ada relawan yang cocok.</td></tr>
              ) : (
                filtered.map((v) => {
                  const wa = v.phone ? v.phone.replace(/[^0-9]/g, '').replace(/^0/, '62') : '';
                  return (
                    <tr key={v.id} className={`transition ${v.is_verified === false ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50/60'}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {v.avatar_url ? (
                            <Image src={v.avatar_url} alt={v.name} width={36} height={36} unoptimized className="w-9 h-9 rounded-full object-cover border border-slate-200 bg-slate-100" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-b from-[#4a98ad] to-[#2f7088] flex items-center justify-center font-bold text-white text-xs">
                              {v.name ? v.name.charAt(0).toUpperCase() : 'R'}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-800 leading-tight">{v.name}</div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">{v.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">{v.profession || '-'}</td>
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {v.posko_name || <span className="text-slate-400 italic">Personal / Rumah</span>}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-500">
                        {v.latitude && v.longitude ? (
                          <a href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-blue-600 hover:underline">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {Number(v.latitude).toFixed(4)}, {Number(v.longitude).toFixed(4)}
                          </a>
                        ) : (
                          <span className="text-slate-400 italic font-sans">Belum diset</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          v.source === 'tolongin' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {v.source === 'tolongin' ? 'Sobat Tolongin' : 'Mandiri SOS'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {v.is_verified === false ? (
                          <button
                            onClick={() => verify(v.id, true)}
                            title="Periksa datanya dulu, lalu setujui"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 transition"
                          >
                            <Clock className="w-3 h-3" />Setujui
                          </button>
                        ) : (
                          <button
                            onClick={() => { if (v.source !== 'tolongin' && window.confirm(`Cabut verifikasi "${v.name}"? Relawan tidak akan tampil di radar sampai disetujui lagi.`)) verify(v.id, false); }}
                            title={v.source === 'tolongin' ? 'Relawan Sobat sudah terverifikasi lewat Tolongin' : 'Cabut verifikasi'}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            <BadgeCheck className="w-3 h-3" />Terverifikasi
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => toggle(v.id, v.is_active)}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition ${
                            v.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <Radio className={`w-3 h-3 ${v.is_active ? 'text-emerald-600' : 'text-slate-400'}`} />
                          {v.is_active ? 'Aktif' : 'Off'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {wa && (
                            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" title="Chat WhatsApp" className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition">
                              <Phone className="w-4 h-4" />
                            </a>
                          )}
                          <button onClick={() => remove(v.id, v.name)} title="Hapus" className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}