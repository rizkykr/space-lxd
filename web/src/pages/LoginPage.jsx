import React, { useState } from 'react';
import { Card, Button, Input } from '../components/ui/primitives';

export function LoginPage({ onLoginSuccess }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        const data = await res.json();
        onLoginSuccess(data.token, data.user);
      } else {
        setError(await res.text());
      }
    } catch (e) {
      setError("Error: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary text-2xl shadow">
            🪐
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Space LXD Control Plane</h1>
          <p className="text-xs text-muted-foreground">Masukkan kredensial Administrator untuk mengelola kluster</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive-foreground rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-foreground font-medium mb-1">Username</label>
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

          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </form>
      </Card>
    </div>
  );
}
