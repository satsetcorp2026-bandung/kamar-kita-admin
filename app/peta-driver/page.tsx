'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, RefreshCw } from 'lucide-react';

interface MapDriver {
  driver_id: string;
  name: string | null;
  vehicle_type: 'ride' | 'car' | null;
  car_class: string | null;
  plate: string | null;
  model: string | null;
  is_engaged: boolean;
  is_test: boolean;
  lat: number;
  lng: number;
  heading: number | null;
  updated_at: string;
  age_seconds: number;
}
interface MapData { online_total: number; engaged_total: number; drivers: MapDriver[] }

const STALE_SECONDS = 120;

// ---------- Leaflet dari CDN (OpenStreetMap, tanpa kuota Google Maps) ----------
interface LMarker {
  setLatLng(ll: [number, number]): LMarker;
  setStyle(o: object): LMarker;
  bindTooltip(t: string): LMarker;
  setTooltipContent(t: string): LMarker;
  addTo(m: LMap): LMarker;
  remove(): void;
}
interface LMap {
  setView(c: [number, number], z: number): LMap;
  fitBounds(b: [number, number][], o?: object): void;
  flyTo(c: [number, number], z: number): void;
  remove(): void;
}
interface LeafletGlobal {
  map(el: HTMLElement, o?: object): LMap;
  tileLayer(url: string, o?: object): { addTo(m: LMap): void };
  circleMarker(ll: [number, number], o?: object): LMarker;
}

function loadLeaflet(): Promise<LeafletGlobal> {
  const w = window as unknown as { L?: LeafletGlobal };
  if (w.L) return Promise.resolve(w.L);
  return new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => (w.L ? resolve(w.L) : reject(new Error('Leaflet tidak termuat')));
    script.onerror = () => reject(new Error('Leaflet gagal diunduh'));
    document.body.appendChild(script);
  });
}

function ageText(s: number) {
  if (s < 60) return `${s} detik lalu`;
  return `${Math.floor(s / 60)} menit lalu`;
}
function styleFor(d: MapDriver) {
  const stale = d.age_seconds > STALE_SECONDS;
  if (stale) return { color: '#64748b', fillColor: '#cbd5e1', fillOpacity: 0.7, weight: 2, radius: 8 };
  if (d.is_engaged) return { color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 2, radius: 9 };
  return { color: '#047857', fillColor: '#10b981', fillOpacity: 0.9, weight: 2, radius: 9 };
}
function tip(d: MapDriver) {
  const jenis = d.vehicle_type === 'car' ? `Mobil${d.car_class ? ' ' + d.car_class : ''}` : 'Motor';
  const status = d.age_seconds > STALE_SECONDS ? 'Posisi lama' : d.is_engaged ? 'Sedang order' : 'Siap terima order';
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  return `<b>${esc(d.name ?? 'Driver')}</b>${d.is_test ? ' (uji coba)' : ''}<br>${jenis} ${esc(d.plate ?? '')}<br>${status}, ${ageText(d.age_seconds)}`;
}

export default function PetaDriverPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markers = useRef<Map<string, LMarker>>(new Map());
  const fitted = useRef(false);
  const [lib, setLib] = useState<LeafletGlobal | null>(null);
  const [failed, setFailed] = useState(false);
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<'all' | 'ride' | 'car'>('all');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    loadLeaflet().then(L => alive && setLib(L)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  // ambil data: sekarang, lalu tiap 10 detik
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { data: res, error: e } = await supabase.rpc('admin_driver_map');
      if (!alive) return;
      if (e) setError(e.message);
      else { setData(res as MapData); setError(''); setLastUpdate(new Date()); }
      setLoading(false);
    };
    run();
    const t = setInterval(run, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [reloadKey]);

  // buat peta sekali
  useEffect(() => {
    if (!lib || !mapEl.current) return;
    const map = lib.map(mapEl.current, { scrollWheelZoom: true }).setView([-6.93, 107.77], 11);
    lib.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
    mapRef.current = map;
    const current = markers.current;
    return () => {
      current.forEach(m => m.remove());
      current.clear();
      map.remove();
      mapRef.current = null;
      fitted.current = false;
    };
  }, [lib]);

  // perbarui penanda tanpa membuat ulang peta
  useEffect(() => {
    const map = mapRef.current;
    if (!lib || !map || !data) return;
    const shown = data.drivers.filter(d => filter === 'all' || d.vehicle_type === filter);
    const ids = new Set(shown.map(d => d.driver_id));
    markers.current.forEach((m, id) => { if (!ids.has(id)) { m.remove(); markers.current.delete(id); } });
    shown.forEach(d => {
      const pos: [number, number] = [d.lat, d.lng];
      const st = styleFor(d);
      const ex = markers.current.get(d.driver_id);
      if (ex) {
        ex.setLatLng(pos).setStyle(st).setTooltipContent(tip(d));
      } else {
        markers.current.set(d.driver_id, lib.circleMarker(pos, st).addTo(map).bindTooltip(tip(d)));
      }
    });
    if (!fitted.current && shown.length > 0) {
      fitted.current = true;
      if (shown.length === 1) map.setView([shown[0].lat, shown[0].lng], 14);
      else map.fitBounds(shown.map(d => [d.lat, d.lng] as [number, number]), { padding: [40, 40], maxZoom: 15 });
    }
  }, [lib, data, filter]);

  const list = (data?.drivers ?? []).filter(d => filter === 'all' || d.vehicle_type === filter);
  const fresh = list.filter(d => d.age_seconds <= STALE_SECONDS).length;
  const withoutPos = data ? Math.max(0, data.online_total - data.drivers.length) : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Peta Driver Langsung</h2>
          <p className="text-sm text-slate-500 mt-1">Posisi driver yang sedang online. Diperbarui otomatis tiap 10 detik.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Langsung
          </span>
          {(['all', 'ride', 'car'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-sm rounded-lg border ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
              {f === 'all' ? 'Semua' : f === 'ride' ? 'Motor' : 'Mobil'}
            </button>
          ))}
          <button onClick={() => { setLoading(true); fitted.current = false; setReloadKey(k => k + 1); }} className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50" aria-label="Muat ulang"><RefreshCw className="w-4 h-4 text-slate-600" /></button>
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-[11px] font-semibold uppercase text-slate-500">Driver online</p><p className="text-xl font-bold text-slate-900 mt-1">{data?.online_total ?? '-'}</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-[11px] font-semibold uppercase text-slate-500">Sedang order</p><p className="text-xl font-bold text-amber-600 mt-1">{data?.engaged_total ?? '-'}</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-[11px] font-semibold uppercase text-slate-500">Posisi segar</p><p className="text-xl font-bold text-emerald-700 mt-1">{fresh}</p><p className="text-xs text-slate-500 mt-1">diperbarui dalam 2 menit</p></div>
        <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-[11px] font-semibold uppercase text-slate-500">Online tanpa posisi</p><p className="text-xl font-bold text-slate-900 mt-1">{withoutPos}</p><p className="text-xs text-slate-500 mt-1">aplikasi ditutup atau GPS mati</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 relative">
          {failed ? (
            <div className="h-[520px] flex items-center justify-center text-sm text-slate-500 bg-white border border-slate-200 rounded-xl">Peta gagal dimuat. Daftar di samping tetap benar.</div>
          ) : (
            <div ref={mapEl} className="h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100" />
          )}
          {loading && !data && <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-xl"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>}
          <div className="flex gap-4 text-[11px] text-slate-600 mt-2">
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1" />Siap order</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-1" />Sedang order</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300 mr-1" />Posisi lama (lebih dari 2 menit)</span>
            {lastUpdate && <span className="ml-auto">Diperbarui {lastUpdate.toLocaleTimeString('id-ID')}</span>}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-700">Daftar driver ({list.length})</div>
          <ul className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
            {list.length === 0 && <li className="p-4 text-sm text-slate-500">Belum ada driver online dengan posisi.</li>}
            {list.map(d => (
              <li key={d.driver_id}>
                <button onClick={() => mapRef.current?.flyTo([d.lat, d.lng], 16)} className="w-full text-left px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800">{d.name ?? 'Driver'}{d.is_test && <span className="ml-1 text-[10px] text-slate-500">(uji coba)</span>}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${d.age_seconds > STALE_SECONDS ? 'bg-slate-100 text-slate-600 border-slate-200' : d.is_engaged ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {d.age_seconds > STALE_SECONDS ? 'Posisi lama' : d.is_engaged ? 'Sedang order' : 'Siap order'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{d.vehicle_type === 'car' ? `Mobil${d.car_class ? ' ' + d.car_class : ''}` : 'Motor'} {d.plate ?? ''} {d.model ? `(${d.model})` : ''}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{ageText(d.age_seconds)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}