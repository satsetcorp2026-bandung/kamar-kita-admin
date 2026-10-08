'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Search,
  X,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Bike,
  Car,
  Siren,
  Flag,
  Phone,
  MapPin,
  Navigation,
} from 'lucide-react';

interface OrderRow {
  id: string;
  status: string;
  service_type: string | null;
  car_class: string | null;
  pickup_address: string | null;
  destination_address: string | null;
  distance_km: number | null;
  price: number | null;
  created_at: string;
  passenger_name: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  has_sos: boolean;
  reports: number;
}

interface Summary {
  active: number;
  completed: number;
  cancelled: number;
  expired: number;
  total: number;
  gmv: number;
  commission: number;
  platform_fee: number;
}

interface Detail {
  order: Record<string, string | number | null>;
  passenger: { id: string; name: string | null; phone: string | null } | null;
  driver: { id: string; name: string | null; phone: string | null; plate: string | null; model: string | null; vehicle_type: string | null } | null;
  bids: Record<string, string | number | null>[];
  review: { rating_type: string; tag: string | null; comment: string | null } | null;
  sos: { role: string; status: string; created_at: string; handled_at: string | null }[];
  reports: number;
  commission_log: { amount: number; balance_after: number; created_at: string } | null;
}

type Group = 'all' | 'active' | 'completed' | 'cancelled' | 'expired';

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  searching: { label: 'Mencari driver', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  driver_assigned: { label: 'Menuju jemput', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  driver_arrived: { label: 'Driver tiba', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_trip: { label: 'Dalam perjalanan', chip: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  completed: { label: 'Selesai', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled_by_passenger: { label: 'Batal (penumpang)', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled_by_driver: { label: 'Batal (driver)', chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  expired: { label: 'Kedaluwarsa', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function rp(n: number | null | undefined) {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n ?? 0)));
}

function fmtDateTime(iso: string | number | null | undefined) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function str(v: string | number | null | undefined) {
  return v === null || v === undefined || v === '' ? '-' : String(v);
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [group, setGroup] = useState<Group>('all');
  const [days, setDays] = useState(30);
  const [typeFilter, setTypeFilter] = useState<'all' | 'ride' | 'car'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    async function run() {
      const [listRes, sumRes] = await Promise.all([
        supabase.rpc('admin_orders_list', {
          p_group: group === 'all' ? null : group,
          p_search: search || null,
          p_days: days,
          p_limit: 300,
        }),
        supabase.rpc('admin_orders_summary', { p_days: days }),
      ]);
      if (!alive) return;
      if (listRes.error) setError(`Gagal memuat pesanan: ${listRes.error.message}`);
      else {
        setError(null);
        setOrders((listRes.data as OrderRow[]) ?? []);
      }
      if (!sumRes.error && sumRes.data) setSummary(sumRes.data as Summary);
      setLoading(false);
      setRefreshing(false);
    }
    run();
    return () => {
      alive = false;
    };
  }, [group, days, search, reloadKey]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    async function run() {
      const { data } = await supabase.rpc('admin_order_detail', { p_order_id: selectedId });
      if (!alive) return;
      setDetail((data as Detail) ?? null);
      setDetailLoading(false);
    }
    run();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  function openOrder(o: OrderRow) {
    setDetail(null);
    setDetailLoading(true);
    setSelectedId(o.id);
  }

  const visible = useMemo(
    () => orders.filter((o) => typeFilter === 'all' || o.service_type === typeFilter),
    [orders, typeFilter]
  );

  const cards: { key: Group; label: string; value: number | undefined; tone: string }[] = [
    { key: 'active', label: 'Sedang berjalan', value: summary?.active, tone: 'text-blue-600' },
    { key: 'completed', label: 'Selesai', value: summary?.completed, tone: 'text-emerald-600' },
    { key: 'cancelled', label: 'Dibatalkan', value: summary?.cancelled, tone: 'text-rose-600' },
    { key: 'all', label: 'Semua pesanan', value: summary?.total, tone: 'text-slate-900' },
  ];

  const o = detail?.order;
  const deal = Number(o?.deal_price ?? o?.offer_price ?? 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Pesanan dan Trip</h2>
          <p className="text-sm text-slate-500 mt-1">Cari trip, lihat rincian tarif, dan telusuri komplain penumpang atau driver.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => {
              setLoading(true);
              setDays(Number(e.target.value));
            }}
            className="text-xs font-semibold rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700"
          >
            <option value={1}>24 jam terakhir</option>
            <option value={7}>7 hari terakhir</option>
            <option value={30}>30 hari terakhir</option>
            <option value={90}>90 hari terakhir</option>
            <option value={365}>1 tahun terakhir</option>
          </select>
          <button
            onClick={() => {
              setRefreshing(true);
              setReloadKey((k) => k + 1);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Muat ulang
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {error}
            <div className="text-xs text-rose-600/80 mt-0.5">Pastikan SQL &quot;Part AR&quot; sudah dijalankan di Supabase SQL Editor.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setLoading(true);
              setGroup(c.key);
            }}
            className={`text-left rounded-2xl border p-4 bg-white transition shadow-sm ${
              group === c.key ? 'border-blue-500 ring-2 ring-blue-500/15' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-semibold text-slate-500">{c.label}</div>
            <div className={`mt-1.5 text-2xl font-extrabold tabular-nums ${c.tone}`}>{c.value === undefined ? '-' : c.value}</div>
          </button>
        ))}
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Nilai trip selesai', value: summary.gmv, hint: 'Total kesepakatan tarif di aplikasi' },
            { label: 'Komisi dari trip', value: summary.commission, hint: 'Potongan dari saldo driver' },
            { label: 'Biaya platform', value: summary.platform_fee, hint: 'Rp1.000 per trip selesai' },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold text-slate-500">{k.label}</div>
              <div className="mt-1.5 text-xl font-extrabold tabular-nums text-slate-900">{rp(k.value)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{k.hint}</div>
            </div>
          ))}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <form
          className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setSearch(searchInput.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama, nomor HP, plat, alamat, atau kode pesanan lalu tekan Enter"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'ride' | 'car')}
            className="text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700"
          >
            <option value="all">Motor dan mobil</option>
            <option value="ride">Pim Ride</option>
            <option value="car">Pim Car</option>
          </select>
        </form>

        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Memuat pesanan...</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400">Tidak ada pesanan yang cocok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/70">
                  <th className="px-5 py-3 font-semibold">Waktu</th>
                  <th className="px-3 py-3 font-semibold">Layanan</th>
                  <th className="px-3 py-3 font-semibold">Rute</th>
                  <th className="px-3 py-3 font-semibold">Penumpang</th>
                  <th className="px-3 py-3 font-semibold">Driver</th>
                  <th className="px-3 py-3 font-semibold text-right">Tarif</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r) => {
                  const meta = STATUS_LABEL[r.status] ?? { label: r.status, chip: 'bg-slate-100 text-slate-600 border-slate-200' };
                  return (
                    <tr key={r.id} onClick={() => openOrder(r)} className="hover:bg-slate-50/70 cursor-pointer transition">
                      <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          {r.service_type === 'car' ? <Car className="w-3.5 h-3.5 text-slate-400" /> : <Bike className="w-3.5 h-3.5 text-slate-400" />}
                          <span className="text-xs font-medium">
                            {r.service_type === 'car' ? `Pim Car${r.car_class === 'large' ? ' Besar' : ''}` : 'Pim Ride'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 max-w-[260px]">
                        <div className="truncate text-[13px] text-slate-800">{r.pickup_address ?? '-'}</div>
                        <div className="truncate text-xs text-slate-400">ke {r.destination_address ?? '-'}</div>
                      </td>
                      <td className="px-3 py-3.5 text-slate-700">{r.passenger_name ?? '-'}</td>
                      <td className="px-3 py-3.5">
                        <div className="text-slate-700">{r.driver_name ?? '-'}</div>
                        <div className="text-xs text-slate-400">{r.vehicle_plate ?? ''}</div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-slate-900">{rp(r.price)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${meta.chip}`}>{meta.label}</span>
                          {r.has_sos && (
                            <span title="Ada SOS" className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-1 rounded-full bg-rose-600 text-white">
                              <Siren className="w-3 h-3" /> SOS
                            </span>
                          )}
                          {r.reports > 0 && (
                            <span title="Ada laporan chat" className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-1 rounded-full bg-amber-100 text-amber-700">
                              <Flag className="w-3 h-3" /> {r.reports}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && orders.length >= 300 && (
          <div className="px-5 py-3 text-xs text-slate-400 border-t border-slate-100">
            Menampilkan 300 pesanan terbaru. Persempit periode atau gunakan pencarian untuk hasil lebih spesifik.
          </div>
        )}
      </section>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={() => setSelectedId(null)} />
          <aside className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col">
            <div className="px-6 h-16 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-base font-bold text-slate-900">Detail pesanan</h3>
                {o && (
                  <span
                    className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full border ${
                      (STATUS_LABEL[String(o.status)] ?? { chip: 'bg-slate-100 text-slate-600 border-slate-200' }).chip
                    }`}
                  >
                    {(STATUS_LABEL[String(o.status)] ?? { label: String(o.status) }).label}
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedId(null)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {detailLoading || !detail || !o ? (
                <div className="py-16 flex justify-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-slate-400 font-mono break-all">{String(o.id)}</div>

                  {detail.sos.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-rose-700">
                        <Siren className="w-4 h-4" /> Ada tombol SOS pada perjalanan ini
                      </div>
                      <ul className="mt-1.5 text-xs text-rose-700 space-y-0.5">
                        {detail.sos.map((s, i) => (
                          <li key={i}>
                            Ditekan {s.role === 'driver' ? 'driver' : 'penumpang'} pada {fmtDateTime(s.created_at)} -{' '}
                            {s.status === 'handled' ? `ditangani ${fmtDateTime(s.handled_at)}` : 'belum ditandai ditangani'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <section>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Rute</h4>
                    <div className="mt-3 space-y-3">
                      <div className="flex gap-3">
                        <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-[11px] text-slate-400">Jemput</div>
                          <div className="text-sm text-slate-900">{str(o.pickup_address)}</div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Navigation className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                        <div>
                          <div className="text-[11px] text-slate-400">Tujuan</div>
                          <div className="text-sm text-slate-900">{str(o.destination_address)}</div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500">
                        Jarak {o.distance_km != null ? `${Number(o.distance_km).toFixed(1)} km` : '-'} - dibuat {fmtDateTime(o.created_at)}
                      </div>
                      {o.cancel_reason_text || o.cancel_reason_code ? (
                        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                          Alasan batal: {str(o.cancel_reason_text ?? o.cancel_reason_code)}
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Rincian tarif</h4>
                    <dl className="mt-3 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                      {[
                        ['Tarif rekomendasi sistem', rp(Number(o.recommended_price ?? 0))],
                        ['Tawaran penumpang', rp(Number(o.offer_price ?? 0))],
                        ['Kesepakatan akhir', rp(deal)],
                        ['Biaya platform', rp(Number(o.platform_fee ?? 0))],
                        ['Komisi (dipotong dari saldo driver)', rp(Number(o.commission_fee ?? 0))],
                      ].map(([k, v]) => (
                        <div key={k} className="px-4 py-2.5 flex justify-between gap-3">
                          <dt className="text-slate-500">{k}</dt>
                          <dd className="font-semibold text-slate-900 tabular-nums">{v}</dd>
                        </div>
                      ))}
                      <div className="px-4 py-3 flex justify-between gap-3 bg-slate-50 rounded-b-xl">
                        <dt className="font-semibold text-slate-700">Total tunai dibayar penumpang</dt>
                        <dd className="font-extrabold text-slate-900 tabular-nums">{rp(deal + Number(o.platform_fee ?? 0))}</dd>
                      </div>
                    </dl>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Pembayaran tunai ke driver. Angka di atas adalah kesepakatan di aplikasi, bukan bukti uang berpindah.
                      {detail.commission_log && ` Potongan saldo driver tercatat ${rp(Math.abs(detail.commission_log.amount))}.`}
                    </p>
                  </section>

                  <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { title: 'Penumpang', name: detail.passenger?.name, phone: detail.passenger?.phone, extra: null as string | null },
                      {
                        title: 'Driver',
                        name: detail.driver?.name,
                        phone: detail.driver?.phone,
                        extra: detail.driver ? `${detail.driver.plate ?? '-'} - ${detail.driver.model ?? '-'}` : null,
                      },
                    ].map((p) => (
                      <div key={p.title} className="rounded-xl border border-slate-200 p-4">
                        <div className="text-[11px] text-slate-400">{p.title}</div>
                        <div className="text-sm font-semibold text-slate-900 mt-0.5">{p.name ?? '-'}</div>
                        {p.extra && <div className="text-xs text-slate-500 mt-0.5">{p.extra}</div>}
                        {p.phone && (
                          <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 mt-2">
                            <Phone className="w-3.5 h-3.5" /> {p.phone}
                          </a>
                        )}
                      </div>
                    ))}
                  </section>

                  {detail.bids.length > 0 && (
                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tawaran driver ({detail.bids.length})</h4>
                      <ul className="mt-3 rounded-xl border border-slate-200 divide-y divide-slate-100">
                        {detail.bids.map((b, i) => (
                          <li key={i} className="px-4 py-2.5 flex justify-between text-sm">
                            <span className="text-slate-600">
                              Tawaran {i + 1}
                              {b.eta_minutes != null ? ` - tiba ${String(b.eta_minutes)} menit` : ''}
                              {b.status ? ` - ${b.status === 'accepted' ? 'diterima' : String(b.status)}` : ''}
                            </span>
                            <span className="font-semibold tabular-nums text-slate-900">{rp(Number(b.bid_price ?? 0))}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {detail.review && (
                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ulasan penumpang</h4>
                      <div className="mt-3 rounded-xl border border-slate-200 p-4 text-sm">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            detail.review.rating_type === 'up'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {detail.review.rating_type === 'up' ? 'Positif' : 'Negatif'}
                        </span>
                        {detail.review.tag && <span className="ml-2 text-slate-600">{detail.review.tag}</span>}
                        {detail.review.comment && <p className="mt-2 text-slate-700">{detail.review.comment}</p>}
                      </div>
                    </section>
                  )}

                  {detail.reports > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      Ada {detail.reports} laporan dari chat pesanan ini. Buka menu Laporan Pengguna untuk membaca isinya.
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}