import { useState } from 'react';
import { ExternalLink, Package, Wrench } from 'lucide-react';
import { ABOUT_METADATA } from '../data/prototype';
import PageHeader from '../components/PageHeader';
import { SectionTitle } from '../components/PrototypeUI';
import { useUiText } from '../i18n/useUiText';
import UpdateCenter from './about/UpdateCenter';

export default function About() {
  const t = useUiText(); const meta = ABOUT_METADATA;
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  return <div className="space-y-8">
    <PageHeader eyebrow={t('ui.about.eyebrow')} title={t('ui.about.title')} description={t('ui.about.desc')} />
    <section className="card relative overflow-hidden p-6 sm:p-8">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[color:var(--color-lime)]"><svg viewBox="0 0 32 32" className="h-7 w-7 text-[color:var(--color-ink)]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 24 L10 8 L16 20 L22 8 L28 24" /></svg></div><div><h2 className="font-display text-3xl tracking-tight text-[color:var(--color-fg)]">{meta.productName}</h2><div className="mt-0.5 text-sm text-[color:var(--color-muted)]">{meta.tagline}</div></div></div><div className="mt-4 flex flex-wrap items-center gap-3"><span className="chip chip-lime">{currentVersion ? `v${currentVersion}` : '—'}</span><span className="chip chip-cyan">{meta.license}</span></div></div>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)]"><Package size={28} className="text-[color:var(--color-lime)]" /></div>
      </div>
    </section>
    <UpdateCenter onVersion={setCurrentVersion} />
    <section className="space-y-4"><SectionTitle title={t('ui.about.capabilities')} description={t('ui.about.capabilities_desc')} eyebrow={t('ui.about.capabilities')} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{meta.capabilities.map(cap => <div key={cap.id} className="card p-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] text-[color:var(--color-lime)]"><Wrench size={16} /></div><h3 className="mt-3 font-display text-xl tracking-tight text-[color:var(--color-fg)]">{cap.label}</h3><p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{cap.description}</p></div>)}</div></section>
    <section className="space-y-4"><SectionTitle title={t('ui.about.privacy')} description={t('ui.about.privacy_desc')} eyebrow={t('ui.about.privacy')} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[
      ['ui.about.self_hosted', 'ui.about.local_db'], ['ui.about.no_third_party', 'ui.about.privacy_desc'], ['ui.about.local_db', 'ui.about.privacy_desc'],
    ].map(([title, description]) => <div key={title} className="card p-4"><h3 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">{t(title)}</h3><p className="mt-1 text-xs leading-5 text-[color:var(--color-muted)]">{t(description)}</p></div>)}</div></section>
    <section className="space-y-4"><SectionTitle title={t('ui.about.tech_stack')} description={t('ui.about.tech_stack_desc')} eyebrow={t('ui.about.tech_stack')} /><div className="card"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[color:var(--color-border)]">{['technology', 'version', 'role'].map(key => <th key={key} className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">{t(`ui.about.${key}`)}</th>)}</tr></thead><tbody>{meta.techStack.map(entry => <tr key={entry.id} className="border-b border-[color:var(--color-border)]/60 last:border-0"><td className="px-4 py-3"><span className="font-medium text-[color:var(--color-fg)]">{entry.name}</span></td><td className="px-4 py-3"><span className="chip chip-cyan">{entry.version}</span></td><td className="px-4 py-3 text-xs text-[color:var(--color-muted)]">{entry.role}</td></tr>)}</tbody></table></div></div></section>
    <section className="space-y-4"><SectionTitle title={t('ui.about.resources')} description={t('ui.about.resources_desc')} eyebrow={t('ui.about.resources')} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{meta.resources.map(resource => <a key={resource.id} href={resource.href} target="_blank" rel="noopener noreferrer" className="card flex items-center gap-3 p-4 transition-colors hover:border-[color:var(--color-lime)]/40"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] text-[color:var(--color-lime)]"><ExternalLink size={16} /></div><div><h3 className="font-display text-xl tracking-tight text-[color:var(--color-fg)]">{resource.label}</h3><p className="text-xs text-[color:var(--color-muted)]">{resource.description}</p></div></a>)}</div></section>
  </div>;
}
