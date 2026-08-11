import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../components/ui/primitives';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export function SetupPage({ onSetupComplete }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: 'admin', password: '', confirmPassword: '', master_public: window.location.origin });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (form.password !== form.confirmPassword) {
      setErrorMsg("Password dan konfirmasi password tidak cocok!");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMsg("Akun admin berhasil dibuat! Mengalihkan ke Dashboard...");
        setTimeout(() => {
          onSetupComplete(data.token, data.user);
          navigate('/', { replace: true });
        }, 1000);
      } else {
        const errText = await res.text();
        setErrorMsg(errText || "Gagal melakukan setup admin.");
      }
    } catch (e) {
      setErrorMsg("Error koneksi: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border-border">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary text-2xl shadow">
            🪐
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Setup Space LXD</h1>
          <p className="text-xs text-muted-foreground">Buat akun Administrator awal untuk kluster Space LXD</p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div>
            <label className="block text-foreground font-medium mb-1">Username Admin</label>
            <Input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Username admin"
              required
            />
          </div>
          <div>
            <label className="block text-foreground font-medium mb-1">Password</label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label className="block text-foreground font-medium mb-1">Konfirmasi Password</label>
            <Input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" className="w-full font-semibold" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                <span>Menyimpan Setup...</span>
              </>
            ) : (
              <span>Simpan & Masuk ke Dashboard</span>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}
