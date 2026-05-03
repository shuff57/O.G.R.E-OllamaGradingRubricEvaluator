/**
 * Toast notification store for OGRE.
 * Simple queued toasts with auto-dismiss. No external deps.
 */

type ToastVariant = 'success' | 'error' | 'warning' | 'info';
type ToastAction = { label: string; onClick: () => void };

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number; // ms, 0 = no auto-dismiss
  action?: ToastAction;
  createdAt: number;
}

let _toasts = $state<Toast[]>([]);
let _counter = 0;

export const toasts = {
  get all(): Toast[] {
    return _toasts;
  },
};

export function showToast(
  message: string,
  opts?: {
    variant?: ToastVariant;
    duration?: number;
    action?: ToastAction;
  },
): string {
  const id = `toast-${++_counter}-${Date.now()}`;
  const toast: Toast = {
    id,
    message,
    variant: opts?.variant ?? 'info',
    duration: opts?.duration ?? 4000,
    action: opts?.action,
    createdAt: Date.now(),
  };
  _toasts = [..._toasts, toast];

  if (toast.duration > 0) {
    setTimeout(() => dismissToast(id), toast.duration);
  }

  return id;
}

export function dismissToast(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id);
}

// Convenience shorthands
export const success = (msg: string, action?: ToastAction) =>
  showToast(msg, { variant: 'success', action });
export const error = (msg: string, action?: ToastAction) =>
  showToast(msg, { variant: 'error', duration: 6000, action });
export const warning = (msg: string, action?: ToastAction) =>
  showToast(msg, { variant: 'warning', action });
export const info = (msg: string, action?: ToastAction) =>
  showToast(msg, { variant: 'info', action });
