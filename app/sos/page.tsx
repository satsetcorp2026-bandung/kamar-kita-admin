'use client';

import React, { useEffect, useState, useTransition, useCallback } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Phone, 
  MapPin, 
  Trash2, 
  Radio
} from 'lucide-react';

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
  source: string;
  created_at: string;
}

export default function SosAdminPage() {
  const [volunteers, setVolunteers] = useState<SosVolunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [, startTransition] = useTransition();

  const loadData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sos_volunteers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVolunteers((data as SosVolunteer[]) || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Terjadi kendala memuat data';
      alert('Gagal memuat relawan: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const { data, error } = await supabase
          .from('sos_volunteers')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (isMounted) {
          setVolunteers((data as SosVolunteer[]) || []);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Terjadi kendala memuat data';
          alert('Gagal memuat relawan: ' + errorMessage);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleManualRefresh = () => {
    setLoading(true);
    loadData();
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const nextStatus = !currentStatus;
      const { error } = await supabase
        .from('sos_volunteers')
        .update({ is_active: nextStatus })
        .eq('id', id);

      if (error) throw error;

      startTransition(() => {
        setVolunteers((prev) =>
          prev.map((item) => (item.id === id ? { ...item, is_active: nextStatus } : item))
        );
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Gagal memperbarui status';
      alert(errorMessage);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus relawan "${name}" dari sistem?`)) return;

    try {
      const { error } = await supabase
        .from('sos_volunteers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      startTransition(() => {
        setVolunteers((prev) => prev.filter((item) => item.id !== id));
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Gagal menghapus data';
      alert(errorMessage);
    }
  };

  const filtered = volunteers.filter((v) =>
    (v.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.profession || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.posko_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.phone || '').includes(search)
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Kelola Relawan Siaga SOS</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Data petugas, tenaga medis, dan relawan warga yang terhubung ke radar darurat warga kos.
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, profesi, posko..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
            />
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabel Utama */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/75 border-b border-gray-200 text-gray-500 font-medium">
              <tr>
                <th className="py-3 px-4">Relawan</th>
                <th className="py-3 px-4">Profesi / Peran</th>
                <th className="py-3 px-4">Posko / Satuan</th>
                <th className="py-3 px-4">Titik Koordinat</th>
                <th className="py-3 px-4">Pintu Masuk</th>
                <th className="py-3 px-4 text-center">Status Radar</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data relawan...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    Tidak ada relawan yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const cleanPhone = item.phone ? item.phone.replace(/[^0-9]/g, '').replace(/^0/, '62') : '';
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition">
                      {/* Identitas */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {item.avatar_url ? (
                            <Image
                              src={item.avatar_url}
                              alt={item.name}
                              width={36}
                              height={36}
                              unoptimized
                              className="w-9 h-9 rounded-full object-cover border border-gray-200 bg-gray-100"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-600 text-xs">
                              {item.name ? item.name.charAt(0).toUpperCase() : 'R'}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-900 leading-tight">{item.name}</div>
                            <div className="text-xs text-gray-500 font-mono mt-0.5">{item.phone}</div>
                          </div>
                        </div>
                      </td>

                      {/* Profesi */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">{item.profession || '-'}</span>
                      </td>

                      {/* Posko */}
                      <td className="py-3 px-4">
                        <span className="text-gray-600 text-xs">
                          {item.posko_name || <span className="text-gray-400 italic">Personal / Rumah</span>}
                        </span>
                      </td>

                      {/* Koordinat & Google Maps Link */}
                      <td className="py-3 px-4 font-mono text-xs text-gray-500">
                        {item.latitude && item.longitude ? (
                          <a
                            href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-blue-600 hover:underline"
                          >
                            <MapPin className="w-3 h-3 text-gray-400" />
                            {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}
                          </a>
                        ) : (
                          <span className="text-gray-400 italic font-sans">Belum diset</span>
                        )}
                      </td>

                      {/* Asal Data */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                          item.source === 'tolongin'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {item.source === 'tolongin' ? 'Sobat Tolongin' : 'Mandiri SOS'}
                        </span>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleActive(item.id, item.is_active)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                            item.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          <Radio className={`w-3 h-3 ${item.is_active ? 'text-emerald-600' : 'text-gray-400'}`} />
                          {item.is_active ? 'Aktif' : 'Off'}
                        </button>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {cleanPhone && (
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Chat WhatsApp"
                              className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-gray-100 rounded-md transition"
                            >
                              <Phone className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => handleDelete(item.id, item.name)}
                            title="Hapus"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                          >
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