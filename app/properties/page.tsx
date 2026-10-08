'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Upload, 
  X, 
  Star, 
  MapPin, 
  Phone,
  Search,
  Filter,
  Eye,
  Edit,
  Save,
  MessageCircle,
  ExternalLink
} from 'lucide-react';

const QUICK_APARTMENT_TYPES = ['Studio', '1 BR', '2 BR', '3 BR', 'Loft'];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const CATEGORY_OPTIONS = ['Semua Kategori', 'Kostan', 'Kontrakan', 'Apartemen', 'G. House'];

function extractCoordsFromMapsUrl(url: string) {
  if (!url) return null;

  const placeMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (placeMatch) return { lat: placeMatch[1], lon: placeMatch[2] };

  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: atMatch[1], lon: atMatch[2] };

  const qMatch = url.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return { lat: qMatch[1], lon: qMatch[2] };

  const directMatch = url.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (directMatch) return { lat: directMatch[1], lon: directMatch[2] };

  return null;
}

interface Property {
  id: string;
  name: string;
  category: string;
  tenant_type: string;
  price_monthly: number | null;
  price_yearly: number | null;
  location: string;
  room_size: string | null;
  facilities: string[];
  description: string | null;
  available_rooms: number;
  image_url: string;
  photos: string[];
  maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  whatsapp: string;
  is_active: boolean;
  is_popular: boolean;
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua Kategori');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [tab, setTab] = useState<'all' | 'active' | 'full' | 'inactive'>('all');

  // Modal Wizard Tambah Baru
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');

  // Form State Tambah Baru
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Kostan');
  const [apartmentType, setApartmentType] = useState('Studio');
  const [tenantType, setTenantType] = useState('PUTRI');
  const [isPopular, setIsPopular] = useState(false);
  const [priceMonthlyRaw, setPriceMonthlyRaw] = useState('');
  const [priceYearlyRaw, setPriceYearlyRaw] = useState('');
  const [location, setLocation] = useState('');
  const [roomSize, setRoomSize] = useState('3x4 Meter');
  const [availableRooms, setAvailableRooms] = useState('1');
  const [facilities, setFacilities] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [mapsUrl, setMapsUrl] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [whatsapp, setWhatsapp] = useState('628');

  // Modal Tinjau Kesiapan Survey
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Modal Edit Hunian
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Property>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const isApartment = category === 'Apartemen';
  const isWholeUnit = isApartment || category === 'Kontrakan' || category === 'G. House';

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });

      if (isMounted) {
        if (!error && data) {
          setProperties(data as Property[]);
        }
        setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleMapsUrlChange = (val: string) => {
    setMapsUrl(val);
    const coords = extractCoordsFromMapsUrl(val);
    if (coords) {
      setLatitude(coords.lat);
      setLongitude(coords.lon);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 10 - photoUrls.length;
    if (remainingSlots <= 0) {
      alert('Maksimal 10 foto untuk satu hunian.');
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    const oversizedFiles = filesToUpload.filter(file => file.size > MAX_FILE_SIZE_BYTES);
    if (oversizedFiles.length > 0) {
      alert(`Terdapat ${oversizedFiles.length} foto melebihi batas 2 MB.`);
      return;
    }

    setUploadingPhoto(true);
    const newUploadedUrls: string[] = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      setUploadProgressText(`Mengunggah (${i + 1}/${filesToUpload.length})...`);

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
      const filePath = `properties/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('kamar-kita')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) continue;

      const { data: publicUrlData } = supabase.storage
        .from('kamar-kita')
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        newUploadedUrls.push(publicUrlData.publicUrl);
      }
    }

    setPhotoUrls((prev) => [...prev, ...newUploadedUrls]);
    setUploadingPhoto(false);
    setUploadProgressText('');
    e.target.value = '';
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setPhotoUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveProperty = async () => {
    if (photoUrls.length === 0 || !whatsapp.trim()) {
      alert('Isi minimal satu foto hunian dan kontak WhatsApp!');
      return;
    }

    setSubmitting(true);
    try {
      const mainImage = photoUrls[0] || 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600';
      const facilityList = facilities
        ? facilities.split(',').map((f) => f.trim()).filter(Boolean)
        : ['WiFi'];

      const finalRoomSize = isApartment && apartmentType.trim()
        ? `${apartmentType.trim()}${roomSize.trim() ? ` • ${roomSize.trim()}` : ''}`
        : roomSize.trim();

      const cleanLat = latitude ? Number(String(latitude).replace(',', '.').trim()) : null;
      const cleanLon = longitude ? Number(String(longitude).replace(',', '.').trim()) : null;

      const newListing = {
        name: name.trim(),
        category,
        tenant_type: tenantType,
        price_monthly: priceMonthlyRaw ? Number(priceMonthlyRaw) : null,
        price_yearly: priceYearlyRaw ? Number(priceYearlyRaw) : null,
        location: location.trim(),
        room_size: finalRoomSize,
        facilities: facilityList,
        image_url: mainImage,
        photos: photoUrls,
        maps_url: (mapsUrl || '').trim(),
        latitude: cleanLat && !isNaN(cleanLat) ? cleanLat : null,
        longitude: cleanLon && !isNaN(cleanLon) ? cleanLon : null,
        whatsapp: whatsapp.trim(),
        available_rooms: parseInt(availableRooms, 10) || 0,
        description: description.trim(),
        tag: isPopular ? 'POPULER' : 'BARU',
        is_popular: isPopular,
        is_active: true,
      };

      const { data, error } = await supabase
        .from('properties')
        .insert([newListing])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        setProperties([data[0] as Property, ...properties]);
      }

      alert('Hunian baru berhasil ditambahkan!');
      setIsModalOpen(false);
      resetForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala sistem';
      alert(`Gagal menyimpan: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setName('');
    setCategory('Kostan');
    setApartmentType('Studio');
    setTenantType('PUTRI');
    setIsPopular(false);
    setPriceMonthlyRaw('');
    setPriceYearlyRaw('');
    setLocation('');
    setRoomSize('3x4 Meter');
    setAvailableRooms('1');
    setFacilities('');
    setDescription('');
    setPhotoUrls([]);
    setMapsUrl('');
    setLatitude('');
    setLongitude('');
    setWhatsapp('628');
  };

  const handleStartEdit = (p: Property) => {
    setEditingProperty(p);
    setEditFormData({
      name: p.name,
      location: p.location,
      price_monthly: p.price_monthly,
      price_yearly: p.price_yearly,
      available_rooms: p.available_rooms,
      whatsapp: p.whatsapp,
      room_size: p.room_size,
      description: p.description,
      maps_url: p.maps_url,
      latitude: p.latitude,
      longitude: p.longitude,
      is_popular: p.is_popular,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProperty) return;

    setSavingEdit(true);
    const { error } = await supabase
      .from('properties')
      .update(editFormData)
      .eq('id', editingProperty.id);

    if (!error) {
      setProperties(properties.map(item => 
        item.id === editingProperty.id ? { ...item, ...editFormData } as Property : item
      ));
      setEditingProperty(null);
    } else {
      alert(`Gagal update: ${error.message}`);
    }
    setSavingEdit(false);
  };

  async function toggleStatus(id: string, currentStatus: boolean) {
    const { error } = await supabase
      .from('properties')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (!error) {
      setProperties(properties.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Yakin ingin menghapus data hunian ini?')) return;
    const { error } = await supabase.from('properties').delete().eq('id', id);
    if (!error) {
      setProperties(properties.filter(p => p.id !== id));
      if (selectedProperty?.id === id) setSelectedProperty(null);
      if (editingProperty?.id === id) setEditingProperty(null);
    }
  }

  const countActive = properties.filter((p) => p.is_active).length;
  const countFull = properties.filter((p) => Number(p.available_rooms || 0) <= 0).length;
  const countInactive = properties.length - countActive;
  const unitsLeft = properties.filter((p) => p.is_active).reduce((a, p) => a + Number(p.available_rooms || 0), 0);

  const filteredProperties = properties.filter((p) => {
    if (tab === 'active' && !p.is_active) return false;
    if (tab === 'inactive' && p.is_active) return false;
    if (tab === 'full' && Number(p.available_rooms || 0) > 0) return false;
    if (selectedCategory !== 'Semua Kategori' && p.category !== selectedCategory) {
      return false;
    }

    if (onlyAvailable && Number(p.available_rooms || 0) <= 0) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchLocation = p.location?.toLowerCase().includes(q);
      if (!matchName && !matchLocation) return false;
    }

    return true;
  });

  const tabs: { key: 'all' | 'active' | 'full' | 'inactive'; label: string; count: number }[] = [
    { key: 'all', label: 'Semua', count: properties.length },
    { key: 'active', label: 'Aktif', count: countActive },
    { key: 'full', label: 'Kamar penuh', count: countFull },
    { key: 'inactive', label: 'Nonaktif', count: countInactive },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800">Hunian</h2>
          <p className="text-sm text-slate-500 mt-1">Kelola listing kost, kontrakan, apartemen, dan jadwal survey.</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="inline-flex items-center gap-2 bg-gradient-to-br from-[#4a98ad] to-[#2f7088] text-white px-5 py-2.5 rounded-full text-[13px] font-bold shadow-[4px_6px_12px_rgba(36,76,96,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-105 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Tambah Hunian
        </button>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total listing', value: properties.length, sub: 'Semua hunian terdaftar', cls: 'from-[#d0dae6] to-[#b3c3d4]', num: 'text-slate-800' },
          { label: 'Aktif', value: countActive, sub: 'Tampil di aplikasi', cls: 'from-[#8fd0c8] to-[#62aea8]', num: 'text-[#0f2f2e]' },
          { label: 'Kamar penuh', value: countFull, sub: 'Perlu cek ketersediaan', cls: 'from-[#eaf3f9] to-[#cfe2ee]', num: 'text-rose-700' },
          { label: 'Unit tersisa', value: unitsLeft, sub: 'Bisa dipesan sekarang', cls: 'from-[#a9a4d4] to-[#8782bb]', num: 'text-[#1c1a40]' },
        ].map((k) => (
          <div key={k.label} className={`rounded-[20px] p-4 bg-gradient-to-br ${k.cls} shadow-[8px_10px_20px_rgba(48,66,92,0.2),-5px_-5px_14px_rgba(255,255,255,0.55),inset_0_1px_0_rgba(255,255,255,0.7)]`}>
            <div className="text-[13px] font-bold text-slate-700">{k.label}</div>
            <div className={`text-3xl font-extrabold tabular-nums mt-1 ${k.num}`}>{loading ? '-' : k.value}</div>
            <div className="text-xs text-slate-600">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tab, pencarian, tabel */}
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
              <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-200/70 text-slate-600'}`}>{t.count}</span>
            </button>
          ))}
        </div>

        <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama hunian atau area"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] focus:outline-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-[13px] font-medium text-slate-700 focus:outline-none"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setOnlyAvailable(!onlyAvailable)}
              className={`text-[13px] font-semibold px-3.5 py-2 rounded-xl border transition-all ${
                onlyAvailable
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Hanya yang ada kamar kosong
            </button>

            {(searchQuery || selectedCategory !== 'Semua Kategori' || onlyAvailable) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('Semua Kategori');
                  setOnlyAvailable(false);
                }}
                className="text-xs text-rose-600 hover:underline px-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-slate-500 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Memuat daftar hunian
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="py-14 text-center text-slate-500 text-sm">
            {properties.length === 0 ? 'Belum ada hunian. Klik Tambah Hunian untuk mulai.' : 'Tidak ada hunian yang cocok dengan pencarian atau filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/70 border-y border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-5">Hunian</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Tarif sewa</th>
                  <th className="py-3 px-4 text-center">Sisa unit</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {filteredProperties.map((p) => {
                  const cleanPhone = (p.whatsapp || '').replace(/[^0-9]/g, '');
                  const waNumber = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone;
                  const isAvailable = Number(p.available_rooms || 0) > 0;

                  return (
                    <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.image_url || '/placeholder.png'}
                            alt={p.name}
                            className="w-12 h-12 rounded-xl object-cover bg-slate-100 border border-slate-200 shrink-0"
                          />
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-nowrap">
                              <span className="whitespace-nowrap">{p.name}</span>
                              {p.is_popular && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded shrink-0">
                                  POPULER
                                </span>
                              )}
                            </div>
                            <div className="text-[12px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400" /> {p.location}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-200/70 text-slate-700">
                          {p.category}, {p.tenant_type}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {p.price_monthly ? (
                          <div className="font-bold text-slate-900 text-[13px]">
                            Rp {Number(p.price_monthly).toLocaleString('id-ID')} / bln
                          </div>
                        ) : null}
                        {p.price_yearly ? (
                          <div className="text-[11px] text-slate-500">
                            Rp {Number(p.price_yearly).toLocaleString('id-ID')} / thn
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          isAvailable
                            ? 'bg-slate-200/70 text-slate-800'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isAvailable ? `${p.available_rooms} unit` : 'Penuh'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => toggleStatus(p.id, p.is_active)}
                          title="Klik untuk mengubah status"
                          className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-bold ${
                            p.is_active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {p.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {p.is_active ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>

                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {waNumber && (
                            <a
                              href={`https://wa.me/${waNumber}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200/60"
                              title="Hubungi pengelola"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleStartEdit(p)}
                            className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200/60"
                            title="Ubah data hunian"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setSelectedProperty(p)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> Tinjau
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Hapus listing"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-500 bg-slate-100/50">
          Menampilkan {filteredProperties.length} dari {properties.length} hunian
        </div>
      </section>

      {/* Modal Tinjau Kesiapan Survey Bareng */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm leading-tight">{selectedProperty.name}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{selectedProperty.category} • {selectedProperty.tenant_type}</p>
              </div>
              <button onClick={() => setSelectedProperty(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Cover & Galeri */}
              <div>
                <span className="font-bold text-slate-700 block mb-1.5 text-[11px] uppercase tracking-wider">
                  Foto Unit & Galeri Kamar
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {(selectedProperty.photos && selectedProperty.photos.length > 0 
                    ? selectedProperty.photos 
                    : [selectedProperty.image_url]
                  ).map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden border bg-slate-100 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`gallery-${idx}`} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Titik Survey & Peta */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" /> Titik Lokasi Survey
                  </span>
                  {selectedProperty.maps_url && (
                    <a
                      href={selectedProperty.maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 font-semibold text-[11px]"
                    >
                      Buka Google Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-slate-600 text-[11px]">{selectedProperty.location}</p>
                <div className="flex gap-4 text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-200/60">
                  <span>Lat: {selectedProperty.latitude || '-'}</span>
                  <span>Lon: {selectedProperty.longitude || '-'}</span>
                  <span>Sisa Kamar: {selectedProperty.available_rooms} Unit</span>
                </div>
              </div>

              {/* Fasilitas & Dimensi */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1 text-[11px]">Dimensi Ruang</span>
                  <span className="text-slate-800 font-semibold">{selectedProperty.room_size || '3x4 Meter'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1 text-[11px]">Tarif Sewa</span>
                  <span className="text-slate-900 font-bold">
                    {selectedProperty.price_monthly ? `Rp ${Number(selectedProperty.price_monthly).toLocaleString('id-ID')}/bln` : '-'}
                  </span>
                </div>
              </div>

              {/* Fasilitas Badge */}
              <div>
                <span className="font-bold text-slate-700 block mb-1.5 text-[11px]">Fasilitas Unit:</span>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedProperty.facilities || []).map((f, i) => (
                    <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 font-medium text-[10px]">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* Deskripsi & Aturan */}
              {selectedProperty.description && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-[11px] leading-relaxed">
                  <span className="font-bold block mb-0.5 text-slate-900">Ketentuan & Aturan Hunian:</span>
                  {selectedProperty.description}
                </div>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-slate-500 text-[11px]">WhatsApp Pengelola: <b>{selectedProperty.whatsapp}</b></span>
              <a
                href={`https://wa.me/${(selectedProperty.whatsapp || '').replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Konfirmasi Jadwal Survey
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Hunian */}
      {editingProperty && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">Edit Data: {editingProperty.name}</h3>
              <button onClick={() => setEditingProperty(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Nama Hunian</label>
                <input
                  type="text"
                  required
                  value={editFormData.name || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:outline-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Harga per Bulan (Rp)</label>
                  <input
                    type="number"
                    value={editFormData.price_monthly || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, price_monthly: e.target.value ? Number(e.target.value) : null })}
                    className="w-full p-2 border rounded-lg focus:outline-blue-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Harga per Tahun (Rp)</label>
                  <input
                    type="number"
                    value={editFormData.price_yearly || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, price_yearly: e.target.value ? Number(e.target.value) : null })}
                    className="w-full p-2 border rounded-lg focus:outline-blue-500 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Sisa Kamar Kosong</label>
                  <input
                    type="number"
                    min="0"
                    value={editFormData.available_rooms ?? 0}
                    onChange={(e) => setEditFormData({ ...editFormData, available_rooms: parseInt(e.target.value, 10) || 0 })}
                    className="w-full p-2 border rounded-lg focus:outline-blue-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Dimensi Luas Ruang</label>
                  <input
                    type="text"
                    value={editFormData.room_size || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, room_size: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:outline-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Lokasi / Area</label>
                <input
                  type="text"
                  required
                  value={editFormData.location || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:outline-blue-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">URL Google Maps</label>
                <input
                  type="text"
                  value={editFormData.maps_url || ''}
                  onChange={(e) => {
                    const text = e.target.value;
                    const coords = extractCoordsFromMapsUrl(text);
                    setEditFormData({
                      ...editFormData,
                      maps_url: text,
                      latitude: coords ? Number(coords.lat) : editFormData.latitude,
                      longitude: coords ? Number(coords.lon) : editFormData.longitude,
                    });
                  }}
                  className="w-full p-2 border rounded-lg focus:outline-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">WhatsApp Pengelola</label>
                  <input
                    type="text"
                    required
                    value={editFormData.whatsapp || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, whatsapp: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:outline-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Rekomendasi Populer</label>
                  <button
                    type="button"
                    onClick={() => setEditFormData({ ...editFormData, is_popular: !editFormData.is_popular })}
                    className={`w-full py-2 rounded-lg border font-bold text-center transition-all ${
                      editFormData.is_popular 
                        ? 'bg-amber-50 text-amber-800 border-amber-300' 
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {editFormData.is_popular ? 'POPULER' : 'STANDAR'}
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Keterangan / Aturan Hunian</label>
                <textarea
                  rows={3}
                  value={editFormData.description || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:outline-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingProperty(null)}
                  className="px-3.5 py-1.5 border rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Wizard Tambah Listing Baru */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 pb-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-slate-900">Tambah Listing Hunian Baru</h3>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${(step / 3) * 100}%` }}
                />
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Informasi Utama</h4>
                    <p className="text-xs text-slate-500">Tentukan tipe properti dan tarif sewa hunian.</p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-2">Kategori Hunian</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['Kostan', 'Kontrakan', 'Apartemen', 'G. House'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setCategory(cat);
                            if (cat === 'Apartemen' && roomSize === '3x4 Meter') setRoomSize('24 m²');
                          }}
                          className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                            category === cat 
                              ? 'bg-blue-500 text-white border-blue-500 font-bold shadow-sm' 
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isApartment && (
                    <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2">
                      <label className="text-xs font-semibold text-blue-950 block">Tipe Apartemen</label>
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_APARTMENT_TYPES.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setApartmentType(t)}
                            className={`px-3 py-1 rounded-md text-xs font-medium border transition-all ${
                              apartmentType === t
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="cth: Studio / 2 BR Corner"
                        value={apartmentType}
                        onChange={(e) => setApartmentType(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-2">Tipe Penghuni</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['PUTRI', 'PUTRA', 'CAMPUR', 'PASUTRI'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTenantType(t)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                            tenantType === t 
                              ? 'bg-blue-500 text-white border-blue-500 font-bold shadow-sm' 
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div 
                    onClick={() => setIsPopular(!isPopular)}
                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                      isPopular ? 'border-amber-400 bg-amber-50/60' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isPopular ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isPopular && <Star className="w-3 h-3 fill-white" />}
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${isPopular ? 'text-amber-900' : 'text-slate-800'}`}>
                        {isPopular ? 'Berlabel POPULER' : 'Listing Standar'}
                      </div>
                      <div className="text-[11px] text-slate-500">Ditampilkan di urutan paling atas beranda aplikasi.</div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Nama Hunian *</label>
                    <input
                      type="text"
                      required
                      placeholder={isApartment ? 'cth: Pinus Apartment Studio 12A' : 'cth: Kost Melati Indah'}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Harga per Bulan (Rp)</label>
                      <input
                        type="text"
                        placeholder="1.200.000"
                        value={priceMonthlyRaw ? Number(priceMonthlyRaw).toLocaleString('id-ID') : ''}
                        onChange={(e) => setPriceMonthlyRaw(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Harga per Tahun (Rp)</label>
                      <input
                        type="text"
                        placeholder="13.000.000"
                        value={priceYearlyRaw ? Number(priceYearlyRaw).toLocaleString('id-ID') : ''}
                        onChange={(e) => setPriceYearlyRaw(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Lokasi / Kampus Terdekat *</label>
                    <input
                      type="text"
                      required
                      placeholder="cth: Sayang, Jatinangor"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-blue-500"
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Ruang & Fasilitas</h4>
                    <p className="text-xs text-slate-500">
                      {isWholeUnit ? 'Konfigurasi unit kamar dan kelengkapan fasilitas.' : 'Ketersediaan sisa kamar kosong dan spesifikasi.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        {isWholeUnit ? 'Jumlah Kamar Tidur dlm Unit' : 'Jumlah Kamar Kosong Tersedia'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={availableRooms}
                        onChange={(e) => setAvailableRooms(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Dimensi Luas Ruang</label>
                      <input
                        type="text"
                        placeholder={isApartment ? 'cth: 24 m²' : isWholeUnit ? 'cth: 36 m² (2 KT, 1 KM)' : 'cth: 3x4 Meter'}
                        value={roomSize}
                        onChange={(e) => setRoomSize(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Fasilitas (Pisahkan dengan koma)</label>
                    <input
                      type="text"
                      placeholder="WiFi, Kasur, Kamar Mandi Dalam, AC, Lemari"
                      value={facilities}
                      onChange={(e) => setFacilities(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Deskripsi Singkat</label>
                    <textarea
                      rows={4}
                      placeholder="Keterangan aturan listrik, air, gerbang, ketentuan jam malam dsb."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-blue-500"
                    />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Foto & Kontak Survey</h4>
                    <p className="text-xs text-slate-500">Unggah foto (maks. 10 foto, maks. 2MB per foto), tautan peta, dan nomor WhatsApp pengelola.</p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-semibold text-slate-700">Foto Hunian *</label>
                      <span className="text-[11px] font-bold text-slate-400">{photoUrls.length}/10 Foto Terunggah</span>
                    </div>

                    <label className={`flex-1 border-2 border-dashed border-blue-300 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer bg-blue-50/40 hover:bg-blue-50 transition-all ${
                      uploadingPhoto || photoUrls.length >= 10 ? 'opacity-50 pointer-events-none' : ''
                    }`}>
                      <Upload className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-blue-600">
                        {uploadingPhoto ? uploadProgressText : '+ Pilih Foto Dari Laptop (Maks. 2MB)'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={uploadingPhoto || photoUrls.length >= 10}
                      />
                    </label>

                    {photoUrls.length > 0 && (
                      <div className="grid grid-cols-5 gap-2.5 mt-3">
                        {photoUrls.map((url, idx) => (
                          <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                            {idx === 0 && (
                              <span className="absolute bottom-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                                Utama
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(idx)}
                              className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-1 opacity-90 hover:opacity-100 shadow transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      URL Google Maps (Auto-Extract Koordinat Lat/Lon)
                    </label>
                    <input
                      type="text"
                      placeholder="Tempel tautan Google Maps di sini..."
                      value={mapsUrl}
                      onChange={(e) => handleMapsUrlChange(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:outline-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Latitude</label>
                      <input
                        type="text"
                        placeholder="cth: -6.936269"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">Longitude</label>
                      <input
                        type="text"
                        placeholder="cth: 107.764772"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-xs focus:outline-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">WhatsApp Pengelola *</label>
                    <div className="flex items-center border border-slate-200 rounded-lg focus-within:border-blue-500 overflow-hidden">
                      <div className="px-3 bg-slate-100 border-r border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-1 py-2.5">
                        <Phone className="w-3.5 h-3.5" /> WA
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="6281234567890"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        className="flex-1 p-2.5 text-sm focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  Kembali
                </button>
              ) : <div />}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1 && (!name.trim() || (!priceMonthlyRaw && !priceYearlyRaw) || !location.trim())) {
                      alert('Lengkapi nama, harga sewa, dan lokasi terlebih dahulu.');
                      return;
                    }
                    setStep(step + 1);
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Lanjut ({step}/3)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveProperty}
                  disabled={submitting || uploadingPhoto}
                  className="flex items-center gap-2 px-6 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Simpan & Terbitkan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}