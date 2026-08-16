import React, { useState } from 'react';
import { Card, Button, Input } from '../components/ui/primitives';
import { Key, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../i18n';

export function ProfilePage({ user }) {
  const { t } = useI18n();
  const [passForm, setPassForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setStatusMsg({ type: '', text: '' });

    if (passForm.new_password !== passForm.confirm_password) {
      return setStatusMsg({ type: 'error', text: t('profile.passwordMismatch') });
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          old_password: passForm.old_password,
          new_password: passForm.new_password
        })
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: t('profile.passwordUpdated') });
        setPassForm({ old_password: '', new_password: '', confirm_password: '' });
      } else {
        setStatusMsg({ type: 'error', text: await res.text() });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">{t('profile.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('profile.subtitle')}</p>
      </div>

      <Card className="p-6 space-y-6">
        <div className="flex items-center gap-4 border-b border-border pb-5">
          <div className="size-14 rounded-2xl bg-primary text-primary-foreground font-bold text-xl flex items-center justify-center shadow">
            {user?.username ? user.username[0].toUpperCase() : 'A'}
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{user?.username || 'admin'}</h2>
            <p className="text-xs font-mono text-primary">{t('profile.role')}</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 text-xs font-sans">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Key className="size-4 text-primary" />
            <span>{t('profile.changePassword')}</span>
          </h3>

          {statusMsg.text && (
            <div className={`p-3 rounded-md flex items-center gap-2 font-mono ${statusMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-destructive/10 text-destructive-foreground border border-destructive/30'}`}>
              {statusMsg.type === 'success' ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <div>
            <label className="block text-foreground font-medium mb-1">{t('profile.currentPassword')}</label>
            <Input
              type="password"
              value={passForm.old_password}
              onChange={(e) => setPassForm({ ...passForm, old_password: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-foreground font-medium mb-1">{t('profile.newPassword')}</label>
            <Input
              type="password"
              value={passForm.new_password}
              onChange={(e) => setPassForm({ ...passForm, new_password: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-foreground font-medium mb-1">{t('profile.confirmPassword')}</label>
            <Input
              type="password"
              value={passForm.confirm_password}
              onChange={(e) => setPassForm({ ...passForm, confirm_password: e.target.value })}
              required
            />
          </div>

          <Button type="submit">
            {t('profile.updatePassword')}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default ProfilePage;
