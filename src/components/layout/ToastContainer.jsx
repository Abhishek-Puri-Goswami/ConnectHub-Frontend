import React from 'react';
import { useToastStore } from '../../store/toastStore';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const TOAST_ICONS = {
  success: CheckCircle,
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_PREFIX = {
  success: 'Success',
  danger: 'Danger',
  warning: 'Warning',
  info: 'Info'
};

function Toast({ toast }) {
  const { id, message, variant } = toast;
  const removeToast = useToastStore((state) => state.removeToast);
  const Icon = TOAST_ICONS[variant] || Info;
  const prefix = TOAST_PREFIX[variant] || 'Info';

  return (
    <div className={`toast toast-${variant}`}>
      <div className="toast-icon">
        <Icon size={20} strokeWidth={2.5} />
      </div>
      <div className="toast-content">
        <strong>{prefix}:</strong> {message}
      </div>
      <button className="toast-close" onClick={() => removeToast(id)}>
        <X size={16} strokeWidth={3} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
