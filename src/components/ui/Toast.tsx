"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import "@/styles/components/toast.css";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (options: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((options: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...options, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            className={`toast toast--${t.type}`}
            onOpenChange={(open) => {
              if (!open) removeToast(t.id);
            }}
          >
            <div className="toast__icon">
              <ToastIcon type={t.type} />
            </div>
            <div className="toast__content">
              <ToastPrimitive.Title className="toast__title">
                {t.title}
              </ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="toast__description">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="toast__close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M12 4L4 12M4 4l8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="toast-provider" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function ToastIcon({ type }: { type: ToastType }) {
  const icons: Record<ToastType, ReactNode> = {
    success: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 18a8 8 0 100-16 8 8 0 000 16z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M6.5 10l2.5 2.5 5-5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    error: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 18a8 8 0 100-16 8 8 0 000 16z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M10 6v5M10 14h.01"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    warning: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M8.57 3.5l-6.5 11.5a1.5 1.5 0 001.3 2.25h13a1.5 1.5 0 001.3-2.25l-6.5-11.5a1.5 1.5 0 00-2.6 0z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M10 8v3M10 14h.01"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
    info: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 18a8 8 0 100-16 8 8 0 000 16z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M10 14v-4M10 6h.01"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  };

  return <>{icons[type]}</>;
}
