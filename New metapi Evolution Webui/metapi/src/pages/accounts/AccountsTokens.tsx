import { useMemo, useState } from "react";
import { Copy, Key, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useUiText } from "../../i18n/useUiText";
import { useToast } from "../../components/Toast";
import { EmptyState, SearchField, StatCard } from "../../components/PrototypeUI";

interface AccountToken {
  id: string;
  name: string;
  account: string;
  siteName: string;
  token: string;
  tokenMasked: string;
  group: string;
  isDefault: boolean;
}

const ACCOUNT_TOKENS: AccountToken[] = [
  { id: "at1", name: "Primary", account: "kenneth@primary", siteName: "New API · HK", token: "sk-acc-7K3A9f2c1d8e", tokenMasked: "sk-acc••••••••8e", group: "default", isDefault: true },
  { id: "at2", name: "Dev", account: "kenneth+dev", siteName: "New API · HK", token: "sk-acc-F91Q1a2b3c4d", tokenMasked: "sk-acc••••••••4d", group: "dev", isDefault: false },
  { id: "at3", name: "Ops", account: "team-ops", siteName: "One API · Tokyo", token: "sk-acc-4XP8b5c6d7e8", tokenMasked: "sk-acc••••••••8e", group: "ops", isDefault: false },
];

export default function AccountsTokens() {
  const t = useUiText();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ACCOUNT_TOKENS.filter((tk) => !q || tk.name.toLowerCase().includes(q) || tk.account.toLowerCase().includes(q) || tk.siteName.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Account Tokens" value={ACCOUNT_TOKENS.length} icon={<Key size={16} />} />
        <StatCard label="Default" value={ACCOUNT_TOKENS.filter((tk) => tk.isDefault).length} trend={{ label: "active default", tone: "lime" }} icon={<Key size={16} />} />
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <SearchField label="Search account tokens" placeholder="Search name, account, site…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md flex-1" />
        <button type="button" onClick={() => showToast("Account token added (prototype).")}
          className="flex h-9 items-center gap-2 rounded-lg bg-[color:var(--color-lime)] px-4 font-mono text-xs font-bold tracking-wider text-[color:var(--color-ink)] hover:opacity-90">
          <Plus size={14} /> ADD TOKEN
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No account tokens match" description="Adjust the search or add a new token." icon={<Key size={18} />} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">NAME</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">ACCOUNT</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">SITE</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">TOKEN</th>
                  <th className="px-4 py-3 font-mono text-[10px] tracking-widest text-[color:var(--color-muted)]">GROUP</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((token) => (
                  <tr key={token.id} className="border-b border-[color:var(--color-border)]/50 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-[color:var(--color-fg)]">
                        {token.name}
                        {token.isDefault && (
                          <span className="chip chip-lime">DEFAULT</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--color-muted)]">{token.account}</td>
                    <td className="px-4 py-3 text-[color:var(--color-muted)]">{token.siteName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                          {revealedId === token.id ? token.token : token.tokenMasked}
                        </span>
                        <button type="button" onClick={() => setRevealedId(revealedId === token.id ? null : token.id)}
                          className="text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                          {revealedId === token.id ? "hide" : "reveal"}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="chip chip-cyan">{token.group}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button type="button" onClick={() => { navigator.clipboard.writeText(token.token); showToast("Token copied (prototype)."); }}
                          className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                          COPY
                        </button>
                        {!token.isDefault && (
                          <button type="button" onClick={() => showToast(`${token.name} set as default (prototype).`)}
                            className="rounded-md border border-[color:var(--color-border)] px-2 py-1 font-mono text-[9px] tracking-wider text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]">
                            SET DEFAULT
                          </button>
                        )}
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