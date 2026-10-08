'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { Route, Lock, Mail, Loader2, ArrowRight } from 'lucide-react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Email atau password salah';
      setErrorMsg(msg === 'Invalid login credentials' ? 'Email atau kata sandi tidak valid' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 selection:bg-blue-500 selection:text-white" style={{ background: 'linear-gradient(135deg, #e3e9f5 0%, #eaf1f6 50%, #dfe8f3 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-b from-[#4a98ad] to-[#2f7088] text-white mb-3 shadow-[0_12px_24px_-10px_rgba(47,112,136,0.6)]">
            <Route className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">PimPim</h1>
          <p className="text-xs text-slate-500 mt-1">Konsol Admin Operasional</p>
        </div>

        {/* Card Form */}
        <form
          onSubmit={handleLogin}
          className="bg-white/80 border border-white rounded-3xl p-7 shadow-[0_20px_50px_-20px_rgba(60,80,130,0.45)] backdrop-blur-xl space-y-4"
        >
          {errorMsg && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-2xl font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              {errorMsg}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Email Admin</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email admin"
                className="w-full text-sm bg-white border border-slate-200 rounded-full pl-11 pr-4 py-2.5 text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Kata Sandi</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-sm bg-white border border-slate-200 rounded-full pl-11 pr-4 py-2.5 text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-b from-[#4a98ad] to-[#2f7088] hover:opacity-90 disabled:opacity-50 text-white font-semibold py-3 rounded-full text-sm transition flex items-center justify-center gap-2 shadow-[0_12px_24px_-10px_rgba(47,112,136,0.6)]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Memverifikasi...
              </>
            ) : (
              <>
                Masuk
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-slate-500 mt-6">
          Hanya untuk operator berwenang PimPim
        </p>
      </div>
    </div>
  );
}