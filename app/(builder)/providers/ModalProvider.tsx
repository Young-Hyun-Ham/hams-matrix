"use client";
import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
type Options = {
  title?: string;
  message?: ReactNode;
  okText?: string;
  cancelText?: string;
  destructive?: boolean;
  closeOnEsc?: boolean;
  closeOnOutside?: boolean;
};
type Item = {
  options: Options;
  confirm: boolean;
  resolve: (v: boolean) => void;
};
const Context = createContext<{
  showAlert: (v: Options | string) => Promise<void>;
  showConfirm: (v: Options | string) => Promise<boolean>;
} | null>(null);
export function useModal() {
  const v = useContext(Context);
  if (!v) throw new Error("Builder ModalProvider is missing");
  return v;
}
export default function ModalProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Item[]>([]),
    pending = useRef(new Set<Item>());
  const enqueue = useCallback(
    (v: Options | string, confirm: boolean) =>
      new Promise<boolean>((resolve) => {
        const item = {
          options: typeof v === "string" ? { message: v } : v,
          confirm,
          resolve,
        };
        pending.current.add(item);
        setQueue((q) => [...q, item]);
      }),
    [],
  );
  const close = (value: boolean) => {
    const item = queue[0];
    if (item) {
      item.resolve(value);
      pending.current.delete(item);
      setQueue((q) => q.slice(1));
    }
  };
  useEffect(() => {
    const items = pending.current;
    return () => {
      for (const item of items) item.resolve(false);
      items.clear();
    };
  }, []);
  const active = queue[0],
    o = active?.options;
  return (
    <Context.Provider
      value={{
        showAlert: async (v) => {
          await enqueue(v, false);
        },
        showConfirm: (v) => enqueue(v, true),
      }}
    >
      {children}
      <Dialog
        open={!!active}
        onClose={(_, reason) => {
          if (reason === "escapeKeyDown" && o?.closeOnEsc === false) return;
          if (reason === "backdropClick" && !o?.closeOnOutside) return;
          close(false);
        }}
        aria-labelledby="builder-dialog-title"
      >
        <DialogTitle id="builder-dialog-title">
          {o?.title ?? (active?.confirm ? "확인" : "알림")}
        </DialogTitle>
        <DialogContent>{o?.message}</DialogContent>
        <DialogActions>
          {active?.confirm && (
            <Button onClick={() => close(false)}>
              {o?.cancelText ?? "취소"}
            </Button>
          )}
          <Button
            autoFocus
            color={o?.destructive ? "error" : "primary"}
            onClick={() => close(true)}
          >
            {o?.okText ?? "확인"}
          </Button>
        </DialogActions>
      </Dialog>
    </Context.Provider>
  );
}
