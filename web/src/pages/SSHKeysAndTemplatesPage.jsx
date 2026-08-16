import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Input, Textarea } from '../components/ui/primitives';
import { Key, Sparkles } from 'lucide-react';
import { useI18n } from '../i18n';

export function SSHKeysAndTemplatesPage() {
  const { t } = useI18n();
  const [sshKeys, setSshKeys] = useState([]);
  const [keyForm, setKeyForm] = useState({ name: '', public_key: '' });
  const [loading, setLoading] = useState(false);
  const { addToast } = useOutletContext();

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/ssh-keys');
      if (res.ok) setSshKeys(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleAddKey = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/ssh-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(keyForm)
      });
      if (res.ok) {
        addToast('success', t('keys.added', { name: keyForm.name }));
        setKeyForm({ name: '', public_key: '' });
        fetchKeys();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const templates = [
    { title: '🚀 Docker Host Server', desc: 'Pre-installed Docker Engine, Docker Compose, & SSH daemon.', tag: 'LXC Container' },
    { title: '🌐 Nginx Web Server SSL', desc: 'Pre-installed Nginx HTTP/2 webserver with Let\'s Encrypt Certbot.', tag: 'LXC Container' },
    { title: '🐍 Python FastAPI Microservice', desc: 'Python 3.12, Uvicorn, Virtualenv, & Gunicorn systemd service.', tag: 'LXC Container' },
    { title: '⚡ Node.js 22 & PM2 Stack', desc: 'Node.js 22 LTS, PM2 Process Manager, & Git deploy pipeline.', tag: 'LXC Container' }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
          {t('keys.title')}
        </h1>
        <p className="text-xs text-muted-foreground mt-1">{t('keys.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Key className="size-4 text-amber-400" />
            <span>{t('keys.manage')}</span>
          </h2>

          <form onSubmit={handleAddKey} className="space-y-3 text-xs font-mono">
            <div>
              <label className="block text-muted-foreground mb-1">{t('keys.labelName')}</label>
              <Input
                type="text"
                placeholder="dev-laptop-key"
                value={keyForm.name}
                onChange={e => setKeyForm({ ...keyForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1">{t('keys.publicKey')}</label>
              <Textarea
                rows="3"
                placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..."
                value={keyForm.public_key}
                onChange={e => setKeyForm({ ...keyForm, public_key: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {t('keys.addKey')}
            </Button>
          </form>

          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">
              {t('keys.registered', { n: sshKeys.length })}
            </h3>
            {sshKeys.length === 0 ? (
              <p className="text-xs font-mono text-muted-foreground italic">{t('keys.noKeys')}</p>
            ) : (
              sshKeys.map((k, idx) => (
                <div key={idx} className="p-3 bg-background border border-border rounded-md flex items-center justify-between text-xs font-mono">
                  <div>
                    <p className="text-foreground font-bold">{k.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-xs">{k.public_key}</p>
                  </div>
                  <Badge variant="outline">{t('keys.registeredBadge')}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span>{t('keys.templates')}</span>
          </h2>

          <div className="space-y-3">
            {templates.map((tpl, i) => (
              <div key={i} className="p-4 bg-background border border-border rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground text-xs">{tpl.title}</h3>
                  <Badge variant="info">{tpl.tag}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-sans">{tpl.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default SSHKeysAndTemplatesPage;
