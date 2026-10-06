'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  HandHeart, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  Phone, 
  Clock, 
  Eye, 
  X, 
  Loader2, 
  Trash2, 
  Search,
  Filter,
  Edit,
  Save,
  MessageCircle,
  Star,
  ThumbsUp,
  MessageSquare
} from 'lucide-react';

const CATEGORY_FILTERS = [
  'Semua Layanan',
  'Anterin / Beliin',
  'Mekanik Motor',
  'Mekanik Mobil',
  'Kelistrikan',
  'Pertukangan & Kebocoran',
  'Service Elektronik',
  'Bantu Angkat Barang',
  'Print & Jilid Dokumen',
];

interface TolonginReview {
  id: string;
  reviewer_name: string;
  rating: number;
  is_liked: boolean;
  comment: string | null;
  created_at: string;
}

interface TolonginPartner {
  id: string;
  name: string;
  phone: string;
  gender: string;
  bio: string | null;
  categories: string[];
  base_price: number;
  price_type: string;
  price_notes: string | null;
  max_distance_km: number;
  operational_hours: string;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  avatar_url: string | null;
  vehicle_photo_url: string | null;
  ktp_url: string | null;
  sim_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  is_sos_volunteer: boolean;
  status: string;
  created_at: string;
  completed_orders: number;
  total_reviews: number;
  total_likes: number;
  avg_rating: number;
  avg_response_minutes: number;
}

export default function TolonginPage() {
  const [partners, setPartners] = useState<TolonginPartner[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState('Semua Layanan');
  const [onlySosVolunteer, setOnlySosVolunteer] = useState(false);

  // Modal Detail & Review State
  const [selectedPartner, setSelectedPartner] = useState<TolonginPartner | null>(null);
  const [detailTab, setDetailTab] = useState<'performance' | 'reviews' | 'docs'>('performance');
  const [partnerReviews, setPartnerReviews] = useState<TolonginReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Edit Modal State
  const [editingPartner, setEditingPartner] = useState<TolonginPartner | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<TolonginPartner>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Signed URL State
  const [ktpSignedUrl, setKtpSignedUrl] = useState<string | null>(null);
  const [simSignedUrl, setSimSignedUrl] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const { data, error } = await supabase
        .from('tolongin_partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (isMounted) {
        if (!error && data) {
          setPartners(data as TolonginPartner[]);
        }
        setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleOpenDetail(partner: TolonginPartner) {
    setSelectedPartner(partner);
    setDetailTab('performance');
    setPartnerReviews([]);
    setKtpSignedUrl(null);
    setSimSignedUrl(null);

    // Ambil Ulasan Warga dari tabel tolongin_reviews
    setLoadingReviews(true);
    const { data: reviewsData } = await supabase
      .from('tolongin_reviews')
      .select('*')
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false });

    if (reviewsData) {
      setPartnerReviews(reviewsData as TolonginReview[]);
    }
    setLoadingReviews(false);

    // Ambil Dokumen Privat KTP & SIM jika ada
    setLoadingDoc(true);
    try {
      if (partner.ktp_url) {
        const cleanPath = partner.ktp_url.replace(/^.*tolongin-private\//, '');
        const { data: ktpRes } = await supabase.storage
          .from('tolongin-private')
          .createSignedUrl(cleanPath, 3600);
        if (ktpRes?.signedUrl) setKtpSignedUrl(ktpRes.signedUrl);
      }

      if (partner.sim_url) {
        const cleanPath = partner.sim_url.replace(/^.*tolongin-private\//, '');
        const { data: simRes } = await supabase.storage
          .from('tolongin-private')
          .createSignedUrl(cleanPath, 3600);
        if (simRes?.signedUrl) setSimSignedUrl(simRes.signedUrl);
      }
    } catch (err: unknown) {
      console.error('Gagal mengambil berkas:', err);
    } finally {
      setLoadingDoc(false);
    }
  }

  function handleStartEdit(partner: TolonginPartner) {
    setEditingPartner(partner);
    setEditFormData({
      name: partner.name,
      phone: partner.phone,
      base_price: partner.base_price,
      price_type: partner.price_type,
      operational_hours: partner.operational_hours,
      max_distance_km: partner.max_distance_km,
      vehicle_type: partner.vehicle_type,
      vehicle_plate: partner.vehicle_plate,
      price_notes: partner.price_notes,
      bio: partner.bio,
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPartner) return;

    setSavingEdit(true);
    const { error } = await supabase
      .from('tolongin_partners')
      .update(editFormData)
      .eq('id', editingPartner.id);

    if (!error) {
      setPartners(partners.map(p => 
        p.id === editingPartner.id ? { ...p, ...editFormData } as TolonginPartner : p
      ));
      setEditingPartner(null);
    } else {
      alert(`Gagal menyimpan perubahan: ${error.message}`);
    }
    setSavingEdit(false);
  }

  async function updatePartnerStatus(id: string, newStatus: 'active' | 'rejected' | 'pending') {
    setUpdatingId(id);
    const isApproved = newStatus === 'active';
    const { error } = await supabase
      .from('tolongin_partners')
      .update({
        status: newStatus,
        is_verified: isApproved,
        is_active: isApproved,
      })
      .eq('id', id);

    if (!error) {
      setPartners(partners.map(p => 
        p.id === id ? { ...p, status: newStatus, is_verified: isApproved, is_active: isApproved } : p
      ));
      if (selectedPartner?.id === id) {
        setSelectedPartner({
          ...selectedPartner,
          status: newStatus,
          is_verified: isApproved,
          is_active: isApproved,
        });
      }
    } else {
      alert(`Gagal memperbarui status: ${error.message}`);
    }
    setUpdatingId(null);
  }

  async function toggleSosVolunteer(id: string, currentVal: boolean) {
    const { error } = await supabase
      .from('tolongin_partners')
      .update({ is_sos_volunteer: !currentVal })
      .eq('id', id);

    if (!error) {
      setPartners(partners.map(p => p.id === id ? { ...p, is_sos_volunteer: !currentVal } : p));
      if (selectedPartner?.id === id) {
        setSelectedPartner({ ...selectedPartner, is_sos_volunteer: !currentVal });
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Yakin ingin menghapus mitra ini dari ekosistem?')) return;
    const { error } = await supabase.from('tolongin_partners').delete().eq('id', id);
    if (!error) {
      setPartners(partners.filter(p => p.id !== id));
      if (selectedPartner?.id === id) setSelectedPartner(null);
      if (editingPartner?.id === id) setEditingPartner(null);
    }
  }

  const pendingCount = partners.filter(p => p.status === 'pending').length;
  const activeCount = partners.filter(p => p.status === 'active' || p.status === 'approved').length;

  const filteredPartners = partners.filter(p => {
    if (activeTab === 'pending' && p.status !== 'pending') return false;
    if (activeTab === 'active' && p.status !== 'active' && p.status !== 'approved') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name?.toLowerCase().includes(q);
      const matchPhone = p.phone?.includes(q);
      if (!matchName && !matchPhone) return false;
    }

    if (selectedCategory !== 'Semua Layanan') {
      if (!p.categories?.includes(selectedCategory)) return false;
    }

    if (onlySosVolunteer && !p.is_sos_volunteer) return false;

    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <HandHeart className="w-6 h-6 text-orange-600" />
            Manajemen Sobat Tolongin
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Kelola verifikasi identitas, pantau performa, dan ulasan warga kos</p>
        </div>

        {/* Tab Status Utama */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold border border-slate-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'all' ? 'bg-white text-orange-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua ({partners.length})
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'active' ? 'bg-white text-emerald-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mitra Aktif ({activeCount})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'pending' ? 'bg-white text-amber-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Butuh Verifikasi ({pendingCount})
          </button>
        </div>
      </div>

      {/* Kontrol Pencarian & Filter */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama atau nomor WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-orange-500 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
            >
              {CATEGORY_FILTERS.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setOnlySosVolunteer(!onlySosVolunteer)}
            className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
              onlySosVolunteer 
                ? 'bg-rose-50 text-rose-700 border-rose-300 font-bold' 
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            🚨 Hanya Relawan SOS
          </button>

          {(searchQuery || selectedCategory !== 'Semua Layanan' || onlySosVolunteer) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('Semua Layanan');
                setOnlySosVolunteer(false);
              }}
              className="text-xs text-rose-600 hover:underline px-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Tabel Data Sobat */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-orange-500" /> Memuat data Sobat Tolongin...
          </div>
        ) : filteredPartners.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Tidak ada mitra yang sesuai dengan pencarian.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Mitra</th>
                  <th className="py-3 px-4">Layanan</th>
                  <th className="py-3 px-4">Skema Tarif</th>
                  <th className="py-3 px-4 text-center">Bantuan Selesai</th>
                  <th className="py-3 px-4 text-center">Rating</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPartners.map((p) => {
                  const isUserActive = p.status === 'active' || p.status === 'approved';
                  const cleanPhone = p.phone.replace(/[^0-9]/g, '');
                  const waNumber = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                            alt={p.name}
                            className="w-10 h-10 rounded-full object-cover bg-slate-100 border border-slate-200 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-1.5 flex-nowrap">
                              <span className="font-semibold text-slate-900 text-sm whitespace-nowrap">{p.name}</span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 leading-none ${
                                p.gender === 'L' ? 'bg-sky-50 text-sky-700 border border-sky-100' : 'bg-pink-50 text-pink-700 border border-pink-100'
                              }`}>
                                {p.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                              <Phone className="w-3 h-3 text-slate-400" /> {p.phone}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-[240px]">
                        <div className="flex flex-wrap gap-1">
                          {p.categories?.slice(0, 2).map((cat, idx) => (
                            <span key={idx} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium border border-slate-200/50">
                              {cat}
                            </span>
                          ))}
                          {(p.categories?.length || 0) > 2 && (
                            <span className="text-[10px] text-slate-400 font-medium px-1 py-0.5">
                              +{p.categories.length - 2} lainnya
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {p.price_type === 'nego' 
                            ? 'Sesuai Kesepakatan' 
                            : `Rp ${Number(p.base_price || 0).toLocaleString('id-ID')} / ${p.price_type}`}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {p.operational_hours || '08:00 - 21:00'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="font-bold text-slate-800 text-xs">{p.completed_orders || 0}</span>
                        <span className="text-slate-400 text-[10px] ml-1">Order</span>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-bold text-amber-700 text-[11px]">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{Number(p.avg_rating || 0).toFixed(1)}</span>
                          <span className="text-amber-500 font-normal text-[10px]">({p.total_reviews || 0})</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          isUserActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isUserActive && <CheckCircle2 className="w-3 h-3" />}
                          {p.status === 'pending' && <Clock className="w-3 h-3" />}
                          {p.status === 'rejected' && <XCircle className="w-3 h-3" />}
                          {p.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={`https://wa.me/${waNumber}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200/60"
                            title="Chat WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </a>

                          <button
                            onClick={() => handleStartEdit(p)}
                            className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200/60"
                            title="Edit Data Mitra"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleOpenDetail(p)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200/60 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" /> Tinjau
                          </button>

                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Hapus Mitra"
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
      </div>

      {/* Modal Tinjau Komprehensif (3 Tab: Kinerja, Ulasan Warga, Dokumen KTP/SIM) */}
      {selectedPartner && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedPartner.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                  alt={selectedPartner.name}
                  className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm">{selectedPartner.name}</h3>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                      {selectedPartner.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {selectedPartner.phone} • Radius {selectedPartner.max_distance_km} km
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPartner(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-Header Tab Navigasi */}
            <div className="flex border-b border-slate-200 bg-slate-50/40 px-4 text-xs font-semibold">
              <button
                onClick={() => setDetailTab('performance')}
                className={`py-2.5 px-3 border-b-2 transition-all ${
                  detailTab === 'performance' ? 'border-orange-600 text-orange-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Kinerja & Rekam Jejak
              </button>
              <button
                onClick={() => setDetailTab('reviews')}
                className={`py-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  detailTab === 'reviews' ? 'border-orange-600 text-orange-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Ulasan Warga ({partnerReviews.length})
              </button>
              <button
                onClick={() => setDetailTab('docs')}
                className={`py-2.5 px-3 border-b-2 transition-all ${
                  detailTab === 'docs' ? 'border-orange-600 text-orange-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Berkas KTP & SIM
              </button>
            </div>

            {/* Konten Modal Berdasarkan Tab */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {/* TAB 1: KINERJA */}
              {detailTab === 'performance' && (
                <div className="space-y-4">
                  {/* Grid Metrik Utama */}
                  <div className="grid grid-cols-4 gap-2.5">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <div className="text-base font-bold text-slate-900">{selectedPartner.completed_orders || 0}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Order Selesai</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <div className="text-base font-bold text-amber-600 flex items-center justify-center gap-0.5">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        {Number(selectedPartner.avg_rating || 0).toFixed(1)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Rating Rata-rata</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <div className="text-base font-bold text-sky-600 flex items-center justify-center gap-1">
                        <ThumbsUp className="w-3 h-3 text-sky-500" />
                        {selectedPartner.total_likes || 0}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Warga Menyukai</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <div className="text-base font-bold text-emerald-600">
                        {selectedPartner.avg_response_minutes || 10} mnt
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Respon Cepat</div>
                    </div>
                  </div>

                  {/* Info Operasional & Armada */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                      <span className="text-slate-500">Tarif Dasar:</span>
                      <span className="font-bold text-slate-900">
                        {selectedPartner.price_type === 'nego' 
                          ? 'Sesuai Kesepakatan' 
                          : `Rp ${Number(selectedPartner.base_price || 0).toLocaleString('id-ID')} / ${selectedPartner.price_type}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                      <span className="text-slate-500">Jam Siaga:</span>
                      <span className="font-semibold text-slate-800">{selectedPartner.operational_hours || '08:00 - 21:00'}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                      <span className="text-slate-500">Armada / Kendaraan:</span>
                      <span className="font-semibold text-slate-800">
                        {selectedPartner.vehicle_type || 'Tanpa Kendaraan'} ({selectedPartner.vehicle_plate || 'Plat -'})
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Status Kesiapsiagaan SOS:</span>
                      <button
                        onClick={() => toggleSosVolunteer(selectedPartner.id, selectedPartner.is_sos_volunteer)}
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border transition-all ${
                          selectedPartner.is_sos_volunteer
                            ? 'bg-rose-50 text-rose-700 border-rose-300'
                            : 'bg-slate-200 text-slate-600 border-slate-300'
                        }`}
                      >
                        {selectedPartner.is_sos_volunteer ? '🚨 Relawan Siaga Aktif' : 'Bukan Relawan SOS'}
                      </button>
                    </div>
                  </div>

                  {/* Catatan / Bio */}
                  {selectedPartner.bio && (
                    <div className="p-3 bg-amber-50/50 border border-amber-200/70 rounded-xl text-amber-900 text-[11px]">
                      <span className="font-bold block mb-0.5">Bio Pengalaman Mitra:</span>
                      {selectedPartner.bio}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ULASAN & KOMENTAR WARGA */}
              {detailTab === 'reviews' && (
                <div className="space-y-3">
                  {loadingReviews ? (
                    <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" /> Memuat ulasan warga...
                    </div>
                  ) : partnerReviews.length === 0 ? (
                    <div className="py-10 text-center text-slate-400">
                      <MessageSquare className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                      Belum ada ulasan atau rating dari pemesan.
                    </div>
                  ) : (
                    partnerReviews.map((rev) => (
                      <div key={rev.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-900">{rev.reviewer_name}</span>
                          <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-bold text-amber-700 text-[10px]">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{rev.rating} / 5</span>
                          </div>
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed italic">
                          &ldquo;{rev.comment || 'Tidak ada catatan tertulis.'}&rdquo;
                        </p>
                        <div className="flex justify-between items-center pt-1 text-[10px] text-slate-400 border-t border-slate-200/40">
                          <span>{new Date(rev.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          {rev.is_liked && (
                            <span className="text-sky-600 font-semibold flex items-center gap-1">
                              <ThumbsUp className="w-2.5 h-2.5" /> Merekomendasikan Mitra
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: DOKUMEN IDENTITAS KTP & SIM */}
              {detailTab === 'docs' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-[11px]">
                      <ShieldCheck className="w-4 h-4 text-orange-600" /> Berkas KTP & SIM (Privat)
                    </span>
                    <span className="text-[10px] text-slate-400">Klik gambar untuk membuka berkas asli</span>
                  </div>

                  {loadingDoc ? (
                    <div className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-500" /> Membuka storage privat...
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                        <span className="font-semibold text-slate-700 block mb-1.5 text-[11px]">1. Foto KTP</span>
                        {ktpSignedUrl ? (
                          <a href={ktpSignedUrl} target="_blank" rel="noreferrer" className="block relative group aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ktpSignedUrl} alt="KTP" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-bold transition-opacity">
                              Buka File Asli
                            </span>
                          </a>
                        ) : (
                          <div className="h-24 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-[10px]">
                            KTP Tidak Tersedia
                          </div>
                        )}
                      </div>

                      <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                        <span className="font-semibold text-slate-700 block mb-1.5 text-[11px]">2. Foto SIM</span>
                        {simSignedUrl ? (
                          <a href={simSignedUrl} target="_blank" rel="noreferrer" className="block relative group aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={simSignedUrl} alt="SIM" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-bold transition-opacity">
                              Buka File Asli
                            </span>
                          </a>
                        ) : (
                          <div className="h-24 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-[10px]">
                            SIM Tidak Tersedia
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Modal Action */}
            <div className="p-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <button
                type="button"
                onClick={() => updatePartnerStatus(selectedPartner.id, 'rejected')}
                disabled={updatingId === selectedPartner.id}
                className="px-3.5 py-1.5 text-xs font-bold text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
              >
                Tolak / Bekukan
              </button>

              <button
                type="button"
                onClick={() => updatePartnerStatus(selectedPartner.id, 'active')}
                disabled={updatingId === selectedPartner.id}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                {updatingId === selectedPartner.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Setujui & Aktifkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Data Mitra */}
      {editingPartner && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">Edit Data: {editingPartner.name}</h3>
              <button onClick={() => setEditingPartner(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Mitra</label>
                  <input
                    type="text"
                    required
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nomor WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={editFormData.phone || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Skema Tarif</label>
                  <select
                    value={editFormData.price_type || 'trip'}
                    onChange={(e) => setEditFormData({ ...editFormData, price_type: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  >
                    <option value="trip">Per Trip / Mulai Dari</option>
                    <option value="jam">Per Jam</option>
                    <option value="nego">Sesuai Kesepakatan (Nego)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tarif Dasar (Rp)</label>
                  <input
                    type="number"
                    value={editFormData.base_price || 0}
                    onChange={(e) => setEditFormData({ ...editFormData, base_price: Number(e.target.value) })}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Jam Operasional</label>
                  <input
                    type="text"
                    placeholder="08:00 - 21:00 / 24 Jam Penuh"
                    value={editFormData.operational_hours || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, operational_hours: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Radius Jarak (km)</label>
                  <input
                    type="number"
                    value={editFormData.max_distance_km || 5}
                    onChange={(e) => setEditFormData({ ...editFormData, max_distance_km: Number(e.target.value) })}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Armada / Kendaraan</label>
                  <input
                    type="text"
                    placeholder="Honda Vario"
                    value={editFormData.vehicle_type || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, vehicle_type: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Plat Nomor</label>
                  <input
                    type="text"
                    placeholder="D 1234 ABC"
                    value={editFormData.vehicle_plate || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, vehicle_plate: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Bio / Pengalaman</label>
                <textarea
                  rows={3}
                  value={editFormData.bio || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, bio: e.target.value })}
                  className="w-full p-2 border rounded-lg focus:outline-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditingPartner(null)}
                  className="px-3.5 py-1.5 border rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}