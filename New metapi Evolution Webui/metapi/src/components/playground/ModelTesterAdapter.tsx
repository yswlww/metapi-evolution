import { useEffect, useMemo, useRef } from 'react';
import ModelTester from '../../../../../src/web/pages/ModelTester';
import legacyStyles from '../../../../../src/web/index.css?inline';
import { useLang } from '../../contexts/LangContext';
import { useTheme } from '../../contexts/ThemeContext';
import { localizeTesterSurface } from './language';

// Scope legacy class names, resets and tokens to this island. Do not import the
// legacy global stylesheet into the new shell: both shells use .card/.btn etc.
export function scopeTesterStyles(styles: string) {
  let isolated = styles.replace(/:root/g, ':scope').replace(/\b(html|body)(?=\s*\{)/g, ':scope');
  const names = [...isolated.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
  for (const name of new Set(names)) {
    isolated = isolated.replace(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, 'g'), `tester-${name}`);
  }
  return `@scope (.model-tester-surface) { ${isolated} }`;
}

const tokenBridge = `
.model-tester-surface {
  min-height: 0; color: var(--color-fg); font-family: inherit;
  --color-bg: var(--color-panel-2);
  --color-bg-card: var(--color-panel);
  --color-border-light: var(--color-border);
  --color-text-primary: var(--color-fg);
  --color-text-secondary: var(--color-muted);
  --color-text-muted: var(--color-muted);
  --color-primary: var(--color-lime);
  --color-primary-light: color-mix(in srgb, var(--color-lime) 12%, transparent);
  --color-primary-hover: var(--color-lime);
}
`;

export default function ModelTesterAdapter() {
  const { lang } = useLang();
  const { theme } = useTheme();
  const root = useRef<HTMLDivElement>(null);
  const styles = useMemo(() => scopeTesterStyles(legacyStyles) + tokenBridge, []);

  useEffect(() => {
    if (root.current) return localizeTesterSurface(root.current, lang);
  }, [lang]);

  return (
    <div className="model-tester-surface" data-theme={theme} ref={root}>
      <style>{styles}</style>
      <ModelTester />
    </div>
  );
}
