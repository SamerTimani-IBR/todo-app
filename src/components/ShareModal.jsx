import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, Smartphone, Share2 } from 'lucide-react';

/**
 * Share modal — shows the app's public URL with a copyable text field and
 * a QR code so users can scan with their phone camera.
 *
 * The URL comes from VITE_PUBLIC_URL if set, otherwise falls back to
 * window.location.origin (useful in production where origin === Vercel URL).
 */
export default function ShareModal({ open, onClose }) {
  const [copied, setCopied] = useState(false);
  const url =
    import.meta.env.VITE_PUBLIC_URL?.trim() || window.location.origin;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for older browsers / non-https
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal share-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <h3 className="modal-title icon-btn">
          <Share2 size={18} /> Share TodoApp
        </h3>
        <p className="modal-message">
          Scan the QR with your phone camera, or copy the link.
        </p>

        <div className="share-url-row">
          <code className="share-url">{url}</code>
          <button
            type="button"
            onClick={handleCopy}
            className=" icon-btn small"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="qr-frame">
          <QRCodeSVG
            value={url}
            size={236}
            level="M"
            bgColor="#ffffff"
            fgColor="#0f172a"
            marginSize={2}
          />
        </div>

        <div className="qr-hint">
          <Smartphone size={14} />
          <span>Open your phone camera and point it at the QR code.</span>
        </div>
      </div>
    </div>
  );
}
