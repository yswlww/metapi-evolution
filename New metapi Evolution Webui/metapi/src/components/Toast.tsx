import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2 } from "lucide-react";
import { useUiText } from "../i18n/useUiText";

interface Toast {
  id: number;
  message: string;
}

interface ToastCtx {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { id, message }]);
      const timer = setTimeout(() => dismiss(id), 2800);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastStack toasts={toasts} onClose={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastStack({
  toasts,
  onClose,
}: {
  toasts: Toast[];
  onClose: (id: number) => void;
}) {
  const t = useUiText();
  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4"
      role="region"
      aria-live="polite"
      aria-label={t("ui.toast.region")}
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => onClose(toast.id)}
          className="pointer-events-auto flex w-full items-center gap-2.5 rounded-xl border border-[color:var(--color-lime)]/50 bg-[color:var(--color-graphite)]/95 px-4 py-3 text-left shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur transition-all duration-200 animate-[toast-in_.2s_ease-out] hover:bg-[color:var(--color-panel)]"
        >
          <CheckCircle2 size={16} className="shrink-0 text-[color:var(--color-lime)]" />
          <span className="min-w-0 flex-1 font-mono text-xs tracking-wide text-[color:var(--color-fg)]">
            {toast.message}
          </span>
        </button>
      ))}
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}