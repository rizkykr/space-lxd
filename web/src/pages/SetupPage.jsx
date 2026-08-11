import React, { useState } from 'react';
import { Card, Button, Input } from '../components/ui/primitives';

export function SetupPage({ onSetupComplete }) {
  const [form, setForm] = useState({ username: 'admin', password: '', confirmPassword: '', master_public: window.location.origin });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) return alert("Password tidak cocok!");
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        const data = await res.json();
        onSetupComplete(data.token, data.user);
      } else {
        alert(await res.text());
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary text-2xl shadow">
            🪐
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Setup Space LXD</h1>
          <p className="text-xs text-muted-foreground">Buat akun Administrator awal untuk kluster Space LXD</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div>
            <label className="block text-foreground font-medium mb-1">Username Admin</label>
            <Input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-foreground font-medium mb-1">Password</label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-foreground font-medium mb-1">Konfirmasi Password</label>
            <Input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
            />
          </div>

          <Button type="submit" className="w-full">
            Simpan & Masuk ke Dashboard
          </Button>
        </form>
      </Card>
    </div>
  );
}
