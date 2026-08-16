import React from 'react';
import { Button, Card, Badge } from '../ui/primitives';
import { ShieldCheck, Cpu, Key, Camera, Rocket, Github } from 'lucide-react';
import { useI18n } from '../../i18n';

export function WelcomeModal({ onClose }) {
  const { t } = useI18n();

  const handleDismiss = () => {
    localStorage.setItem('space_lxd_welcome_seen', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <Card className="max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border-primary/30 relative bg-card/95">
        
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-primary/20 via-cyan-500/20 to-primary/10 border border-primary/30 text-3xl shadow-lg">
            🚀
          </div>
          <div>
            <Badge variant="outline" className="mb-2 text-cyan-400 border-cyan-500/30 bg-cyan-500/10 font-mono text-[11px]">
              👨‍💻 {t('welcome.badge')}
            </Badge>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
              {t('welcome.title')} 🪐✨
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              {t('welcome.subtitle')}
            </p>
          </div>
        </div>

        {/* Rules & Guidelines */}
        <div className="space-y-3 text-xs font-mono">
          <h3 className="font-semibold text-foreground text-xs uppercase tracking-wider flex items-center gap-2 border-b border-border pb-2">
            <span>📋 {t('welcome.rules')}</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="size-4 shrink-0" />
                <span>{t('welcome.security')}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-sans">
                {t('welcome.securityDesc')}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-semibold">
                <Cpu className="size-4 shrink-0" />
                <span>{t('welcome.resource')}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-sans">
                {t('welcome.resourceDesc')}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-1">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                <Key className="size-4 shrink-0" />
                <span>{t('welcome.ssh')}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-sans">
                {t('welcome.sshDesc')}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-1">
              <div className="flex items-center gap-2 text-purple-400 font-semibold">
                <Camera className="size-4 shrink-0" />
                <span>{t('welcome.snapshot')}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-sans">
                {t('welcome.snapshotDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60">
          <a
            href="https://github.com/rizkykr/space-lxd"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground font-mono flex items-center gap-1.5 transition-colors"
          >
            <Github className="size-3.5" />
            <span>{t('welcome.github')}</span>
          </a>

          <Button
            variant="default"
            size="md"
            onClick={handleDismiss}
            className="w-full sm:w-auto font-semibold px-6 bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-600 text-white shadow-lg"
          >
            <Rocket className="size-4 mr-2" />
            <span>{t('welcome.start')}</span>
          </Button>
        </div>

      </Card>
    </div>
  );
}

export default WelcomeModal;
