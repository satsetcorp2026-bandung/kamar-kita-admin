'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Megaphone, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Upload, 
  X, 
  Bell, 
  Send, 
  Eye, 
  Layers
} from 'lucide-react';

interface Banner {
  id: string;
  title: string;
  description: string;
  tag: string;
  tag_bg: string;
  order_index: number;
  is_active: boolean;
  image_url: string;
  created_at: string;
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'banners' | 'broadcast'>('banners');

  // Modal Tambah Banner
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerDesc, setBannerDesc] = useState('');
  const [bannerTag, setBannerTag] = useState('PROMO');
  const [bannerTagBg, setBannerTagBg] = useState('#0284C7');
  const [bannerOrder, setBannerOrder] = useState('1');
  const [bannerImageUrl, setBannerImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);

  // Broadcast Notifikasi (Expo Push Tokens)
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [notifTarget, setNotifTarget] = useState<'all' | 'users' | 'partners'>('all');
  const [sendingNotif, setSendingNotif] = useState(false);
  const [targetTokenCount, setTargetTokenCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 1. Ambil data banner
      const { data: bannerData, error } = await supabase
        .from('banners')
        .select('*')
        .order('order_index', { ascending: true });

      if (isMounted) {
        if (!error && bannerData) {
          setBanners(bannerData as Banner[]);
        }
        setLoading(false);
      }

      // 2. Hitung jumlah token penerima notifikasi
      const { count } = await supabase
        .from('user_push_tokens')
        .select('*', { count: 'exact', head: true });

      if (isMounted && count !== null) {
        setTargetTokenCount(count);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Upload Foto Banner ke Supabase Storage (kamar-kita/banners/)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran banner maksimal 2 MB.');
      return;
    }

    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `banner_${Date.now()}.${ext}`;
      const filePath = `banners/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('kamar-kita')
        .upload(filePath, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('kamar-kita')
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        setBannerImageUrl(publicUrlData.publicUrl);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah foto.';
      alert(msg);
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  // Simpan Banner Baru
  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerTitle.trim() || !bannerImageUrl.trim()) {
      alert('Judul dan Gambar Banner wajib diisi!');
      return;
    }

    setSavingBanner(true);
    try {
      const newBanner = {
        title: bannerTitle.trim(),
        description: bannerDesc.trim(),
        tag: bannerTag.trim().toUpperCase(),
        tag_bg: bannerTagBg,
        order_index: parseInt(bannerOrder, 10) || 1,
        image_url: bannerImageUrl.trim(),
        is_active: true,
      };

      const { data, error } = await supabase
        .from('banners')
        .insert([newBanner])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        setBanners([...banners, data[0] as Banner]);
      }

      setIsBannerModalOpen(false);
      resetBannerForm();
      alert('Banner promo berhasil diterbitkan!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan banner.';
      alert(msg);
    } finally {
      setSavingBanner(false);
    }
  };

  const resetBannerForm = () => {
    setBannerTitle('');
    setBannerDesc('');
    setBannerTag('PROMO');
    setBannerTagBg('#0284C7');
    setBannerOrder('1');
    setBannerImageUrl('');
  };

  // Toggle On/Off Banner
  async function toggleBannerStatus(id: string, currentStatus: boolean) {
    const { error } = await supabase
      .from('banners')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (!error) {
      setBanners(banners.map(b => b.id === id ? { ...b, is_active: !currentStatus } : b));
    }
  }

  // Hapus Banner
  async function handleDeleteBanner(id: string) {
    if (!confirm('Hapus banner promo ini?')) return;
    const { error } = await supabase.from('banners').delete().eq('id', id);
    if (!error) {
      setBanners(banners.filter(b => b.id !== id));
    }
  }

  // Kirim Broadcast Push Notification via Expo HTTP API
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifBody.trim()) {
      alert('Judul dan pesan notifikasi tidak boleh kosong!');
      return;
    }

    setSendingNotif(true);
    try {
      // Daftar token diambil lewat fungsi server khusus admin
      const { data: tokenData, error: tokenErr } = await supabase.rpc('admin_push_tokens', { p_target: notifTarget });
      if (tokenErr) throw tokenErr;
      const tokens: string[] = (tokenData as string[] | null) ?? [];

      if (tokens.length === 0) {
        alert('Tidak ada token perangkat yang aktif terdaftar untuk target ini.');
        setSendingNotif(false);
        return;
      }

      // Format payload pesan ke Expo Push Server
      const messages = tokens.map(token => ({
        to: token,
        sound: 'default',
        title: notifTitle.trim(),
        body: notifBody.trim(),
        data: { screen: 'Beranda' },
      }));

      // Kirim dalam chunk per 100 token ke endpoint resmi Expo
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        throw new Error('Gagal mengirim ke server Expo.');
      }

      alert(`Notifikasi berhasil disiarkan ke ${tokens.length} perangkat! 🚀`);
      setNotifTitle('');
      setNotifBody('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat menyiarkan notifikasi.';
      alert(msg);
    } finally {
      setSendingNotif(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Utama */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-orange-600" />
            Banner Promo & Notifikasi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur slider promo beranda aplikasi dan kirim pesan siaran instan ke ponsel warga kos
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold border border-slate-200">
          <button
            onClick={() => setActiveTab('banners')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'banners' ? 'bg-white text-orange-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Banner Beranda ({banners.length})
          </button>
          <button
            onClick={() => setActiveTab('broadcast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'broadcast' ? 'bg-white text-orange-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Siaran Notifikasi (Push)
          </button>
        </div>
      </div>

      {/* KONTEN TAB 1: MANAJEMEN BANNER PROMO */}
      {activeTab === 'banners' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-600">
              Urutan slider mengikuti <b>Nomor Urut</b>. Format foto ideal: <b>16:9 atau 2:1</b>.
            </span>
            <button
              onClick={() => { resetBannerForm(); setIsBannerModalOpen(true); }}
              className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Tambah Banner Promo
            </button>
          </div>

          {/* Grid List Banner */}
          {loading ? (
            <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-orange-500" /> Memuat banner promo...
            </div>
          ) : banners.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
              Belum ada banner promo aktif di aplikasi.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {banners.map((b) => (
                <div key={b.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Preview Banner */}
                  <div className="relative aspect-[16/8] bg-slate-100 border-b border-slate-100 overflow-hidden group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.image_url || '/placeholder.png'}
                      alt={b.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span 
                      className="absolute top-2.5 left-2.5 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow"
                      style={{ backgroundColor: b.tag_bg || '#0284C7' }}
                    >
                      {b.tag}
                    </span>
                    <span className="absolute top-2.5 right-2.5 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">
                      Urut #{b.order_index}
                    </span>
                  </div>

                  {/* Info Banner */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm leading-snug">{b.title}</h4>
                      <p className="text-slate-500 text-xs mt-1 line-clamp-2">{b.description || 'Tidak ada keterangan tambahan.'}</p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={() => toggleBannerStatus(b.id, b.is_active)}
                        className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          b.is_active 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {b.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {b.is_active ? 'Tayang' : 'Nonaktif'}
                      </button>

                      <div className="flex items-center gap-1.5">
                        <a
                          href={b.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Lihat Gambar Penuh"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleDeleteBanner(b.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Hapus Banner"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KONTEN TAB 2: BROADCAST PUSH NOTIFICATION */}
      {activeTab === 'broadcast' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Form Pengiriman */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-orange-600" />
                Kirim Siaran Notifikasi (Push Notification)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pesan ini akan langsung muncul di panel bar notifikasi ponsel pengguna secara serentak.
              </p>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Target Pengguna</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifTarget('all')}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-all ${
                      notifTarget === 'all' 
                        ? 'bg-orange-50 border-orange-500 text-orange-700 font-bold' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Semua Warga ({targetTokenCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifTarget('users')}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-all ${
                      notifTarget === 'users' 
                        ? 'bg-orange-50 border-orange-500 text-orange-700 font-bold' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Pencari Hunian
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifTarget('partners')}
                    className={`py-2 px-3 rounded-lg border text-center font-medium transition-all ${
                      notifTarget === 'partners' 
                        ? 'bg-orange-50 border-orange-500 text-orange-700 font-bold' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Mitra Sobat Tolongin
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Judul Notifikasi *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Promo Spesial Kost Dekat Unpad! 🎉"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  className="w-full p-2.5 border rounded-lg focus:outline-orange-500 font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Isi Pesan Singkat *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Contoh: Dapatkan diskon sewa bulan pertama untuk 5 kosan pilihan di Jatinangor hari ini..."
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  className="w-full p-2.5 border rounded-lg focus:outline-orange-500 leading-relaxed"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={sendingNotif}
                  className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-sm transition-all disabled:opacity-50"
                >
                  {sendingNotif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Siarkan Notifikasi Sekarang
                </button>
              </div>
            </form>
          </div>

          {/* Preview Tampilan di Handphone Pengguna */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col items-center justify-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">
              Simulasi Tampilan di Handphone
            </span>

            <div className="w-full max-w-[280px] bg-white rounded-2xl border border-slate-300 p-3 shadow-md space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-orange-500 flex items-center justify-center text-white text-[9px] font-bold">
                    K
                  </div>
                  <span className="text-[10px] font-bold text-slate-800">Kamar Kita</span>
                </div>
                <span className="text-[9px] text-slate-400">Baru saja</span>
              </div>

              <div>
                <div className="font-bold text-xs text-slate-900 leading-snug">
                  {notifTitle || 'Judul Notifikasi...'}
                </div>
                <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  {notifBody || 'Pesan notifikasi siaran akan muncul seperti ini di layar ponsel warga...'}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 text-center mt-4">
              Terkoneksi langsung ke {targetTokenCount} perangkat yang memasang aplikasi Kamar Kita.
            </p>
          </div>
        </div>
      )}

      {/* Modal Tambah Banner Promo Baru */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">Tambah Banner Promo Baru</h3>
              <button onClick={() => setIsBannerModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBanner} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Judul Banner *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Diskon Sewa Awal Semester"
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-orange-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Keterangan Singkat</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Khusus kost putri area Caringin & Sayang"
                  value={bannerDesc}
                  onChange={(e) => setBannerDesc(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:outline-orange-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tag Label</label>
                  <input
                    type="text"
                    placeholder="PROMO / INFO"
                    value={bannerTag}
                    onChange={(e) => setBannerTag(e.target.value)}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500 font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Warna Badge</label>
                  <div className="flex items-center gap-2 border rounded-lg p-1.5">
                    <input
                      type="color"
                      value={bannerTagBg}
                      onChange={(e) => setBannerTagBg(e.target.value)}
                      className="w-6 h-6 border-0 p-0 rounded cursor-pointer"
                    />
                    <span className="font-mono text-[10px] text-slate-600 uppercase">{bannerTagBg}</span>
                  </div>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Urutan</label>
                  <input
                    type="number"
                    min="1"
                    value={bannerOrder}
                    onChange={(e) => setBannerOrder(e.target.value)}
                    className="w-full p-2 border rounded-lg focus:outline-orange-500"
                  />
                </div>
              </div>

              {/* Upload Gambar Banner */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Gambar Banner (16:9 / 2:1) *</label>
                <label className={`w-full border-2 border-dashed border-orange-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-orange-50/40 hover:bg-orange-50 transition-all ${
                  uploadingImage ? 'opacity-50 pointer-events-none' : ''
                }`}>
                  <Upload className="w-5 h-5 text-orange-600" />
                  <span className="text-xs font-bold text-orange-600">
                    {uploadingImage ? 'Mengunggah gambar...' : '+ Pilih Banner Dari Laptop (Maks. 2MB)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                </label>

                {bannerImageUrl && (
                  <div className="relative aspect-[16/8] rounded-xl overflow-hidden border border-slate-200 mt-2 bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bannerImageUrl} alt="Preview Banner" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setBannerImageUrl('')}
                      className="absolute top-2 right-2 bg-rose-600 text-white rounded-full p-1 shadow"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsBannerModalOpen(false)}
                  className="px-3.5 py-1.5 border rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingBanner || uploadingImage}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50"
                >
                  {savingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Terbitkan Banner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}