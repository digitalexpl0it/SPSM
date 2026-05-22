import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export type ToastVariant = "success" | "error";

type ToastItem = {
  id: number;
  variant: ToastVariant;
  message: string;
};

type ToastContextValue = {
  showToast: (variant: ToastVariant, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_MS = 6000;

export function formatErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Something went wrong";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((variant: ToastVariant, message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, variant, message }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0 pointer-events-none"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  const isSuccess = toast.variant === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md animate-[toast-in_0.25s_ease-out] ${
        isSuccess
          ? "border-emerald-500/40 bg-void/95 text-emerald-100"
          : "border-red-500/40 bg-void/95 text-red-100"
      }`}
    >
      <Icon
        className={`w-5 h-5 shrink-0 mt-0.5 ${isSuccess ? "text-emerald-400" : "text-red-400"}`}
        aria-hidden
      />
      <p className="text-sm leading-snug flex-1 min-w-0">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-0.5 rounded text-mist hover:text-white transition"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
