import { useUiText } from '../../i18n/useUiText';

type ProbeSettings = {
  probeEnabled: boolean;
  probeScope: 'single' | 'all';
  probeModel: string;
};

export default function SiteProbeSettings({ value, onChange }: {
  value: ProbeSettings;
  onChange: (patch: Partial<ProbeSettings>) => void;
}) {
  const t = useUiText();
  return (
    <fieldset className="space-y-3 rounded-lg border border-[color:var(--color-border)] p-4">
      <legend className="px-1 font-mono text-[10px] tracking-wider text-[color:var(--color-muted)]">{t('ui.sites.probe_scope_label')}</legend>
      <label className="flex items-center gap-2 text-xs text-[color:var(--color-fg)]">
        <input type="checkbox" aria-label={t('ui.sites.probe_enabled')} checked={value.probeEnabled}
          onChange={(e) => onChange({ probeEnabled: e.target.checked })} className="accent-[color:var(--color-lime)]" />
        {t('ui.sites.probe_enabled')}
      </label>
      <div className="flex flex-wrap gap-4">
        {(['single', 'all'] as const).map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-xs text-[color:var(--color-fg)]">
            <input type="radio" name="siteProbeScope" value={scope} checked={value.probeScope === scope}
              onChange={() => onChange({ probeScope: scope })} className="accent-[color:var(--color-lime)]" />
            {t(`ui.sites.probe_scope_${scope}`)}
          </label>
        ))}
      </div>
      {value.probeScope === 'single' && (
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] text-[color:var(--color-muted)]">{t('ui.sites.probe_model_label')}</span>
          <input value={value.probeModel} onChange={(e) => onChange({ probeModel: e.target.value })}
            placeholder={t('ui.sites.probe_model_ph')}
            className="h-9 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] px-3 font-mono text-[10px] text-[color:var(--color-fg)] outline-none focus:border-[color:var(--color-lime)]/50" />
        </label>
      )}
      <p className="text-xs leading-relaxed text-[color:var(--color-muted)]">{t('ui.sites.probe_scope_hint')}</p>
      {value.probeScope === 'single' && <p className="text-xs text-[color:var(--color-muted)]">{t('ui.sites.probe_model_hint')}</p>}
    </fieldset>
  );
}
