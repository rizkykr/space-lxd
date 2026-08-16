import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '../ui/primitives';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useI18n } from '../../i18n';

export function ConfirmDialog({
  isOpen,
  title,
  message,
  requireMatchText = '',
  confirmLabel,
  confirmVariant = 'destructive',
  loading = false,
  onConfirm,
  onClose
}) {
  const { t } = useI18n();
  const [typedText, setTypedText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTypedText('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isMatchValid = !requireMatchText || typedText.trim() === requireMatchText.trim();
  const defaultConfirmLabel = confirmLabel || t('confirm.confirmDelete');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isMatchValid && onConfirm) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 space-y-5 shadow-2xl relative border-destructive/30 bg-card font-sans">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-destructive/10 text-destructive border border-destructive/20 shrink-0">
              <AlertTriangle className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
            </div>
          </div>

          {requireMatchText && (
            <div className="space-y-2 pt-2 border-t border-border font-mono text-xs">
              <label className="block text-foreground font-medium">
                {t('confirm.typeToConfirm', { name: '' })}{' '}
                <span className="text-destructive font-bold select-all bg-destructive/10 px-1.5 py-0.5 rounded border border-destructive/20">
                  {requireMatchText}
                </span>{' '}
                :
              </label>
              <Input
                type="text"
                placeholder={requireMatchText}
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                className="w-full text-xs font-mono border-destructive/40 focus:border-destructive"
                autoFocus
              />
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              {t('confirm.cancel')}
            </Button>
            <Button type="submit" variant={confirmVariant} size="sm" disabled={!isMatchValid || loading}>
              {loading && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              <span>{loading ? t('confirm.processing') : defaultConfirmLabel}</span>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default ConfirmDialog;
