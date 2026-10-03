import { useMemo, useState } from "react";
import { Copy, Key, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useUiText } from "../../i18n/useUiText";
import { useToast } from "../../components/Toast";
import { EmptyState, SearchField, StatCard } from "../../components/PrototypeUI";

interface ApiKeyAccount {
  id: string;
  siteName: string;
  baseUrl: string;
  apiKey: string;
  apiKeyMasked: string;
  enabled: boolean;
  note: string;
}

const API_KEY_ACCOUNTS: ApiKeyAccount[] = [
  { id: "ak1", siteName: "New API · HK", baseUrl: "https://api.newapi-hk.com", apiKey: "sk-newapi-hk-7K3A9f2c", apiKeyMasked: "sk-newapi••••••••2c", enabled: true, note: "Production primary" },
  { id: "ak2", siteName: "One API · Tokyo", baseUrl: "https://one-jp.aihub.dev", apiKey: "sk-oneapi-jp-F91Q1a2b", apiKeyMasked: "sk-oneapi••••••••2b", enabled: true, note: "Claude fallback" },
  { id: "ak3", siteName: "OneHub · SG", baseUrl: "https://sg.onehub.link", apiKey: "sk-onehub-sg-4XP8b5c6", apiKeyMasked: "sk-onehub••••••••c6", enabled: false, note: "Paused for maintenance" },
];

export default function AccountsApiKeys() {
  const t = useUiText();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return API_KEY_ACCOUNTS.filter((a) => !q || a.siteName.toLowerCase().includes(q) || a.note.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="API Keys" value={API_KEY_ACCOUNTS.length} icon={<Key size={16} />} />
        <StatCard label="Enabled" value={API_KEY_ACCOUNTS.filter((a) => a.enabled).length} trend={{ label: "active", tone: "lime" }} icon={<Key size={16} />} />
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <SearchField label="Search API keys" placeholder="Search site or note…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md flex-1" />
        <button type="button" onClick={() => showToast("API key account added (prototype).")}
          className="flex h-9 items-center gap-2 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
          <Plus size={14} /> ADD API KEY
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No API key accounts match" description="Adjust the search or add a new key." icon={<Key size={18} />} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">SITE</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">BASE URL</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">API KEY</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">STATUS</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">NOTE</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => (
                  <tr key={account.id} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-[color:var(--color-fg)]">{account.siteName}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-[color:var(--color-muted)]">{account.baseUrl}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                          {revealedId === account.id ? account.apiKey : account.apiKeyMasked}
                        </span>
                        <button type="button" onClick={() => setRevealedId(revealedId === account.id ? null : account.id)}
                          className="text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                          {revealedId === account.id ? "hide" : "reveal"}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider ${
                        account.enabled ? "bg-[color:var(--color-lime)]/10 text-[color:var(--color-lime)]" : "bg-[color:var(--color-muted)]/10 text-[color:var(--color-muted)]"
                      }`}>
                        {account.enabled ? "ENABLED" : "DISABLED"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--color-muted)]">{account.note}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => { navigator.clipboard.writeText(account.apiKey); showToast("API key copied (prototype)."); }}
                          className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                          COPY
                        </button>
                        <button type="button" onClick={() => showToast("Connection tested (prototype).")}
                          className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                          TEST
                        </button>
                        <button type="button" onClick={() => showToast("API key revoked (prototype).")}
                          className="rounded-md border border-[color:var(--color-rose)]/40 px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-rose)] hover:bg-[color:var(--color-rose)]/10">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}