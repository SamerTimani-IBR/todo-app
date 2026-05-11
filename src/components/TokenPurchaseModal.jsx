import { useState } from 'react';
import { Coins, X as CloseIcon, Sparkles, Check } from 'lucide-react';
import TapPaymentModal from './TapPaymentModal.jsx';

// KWD / BHD / OMR use 3 decimals (fils). Everything else uses 2.
function decimalsFor(currency) {
  return ['KWD', 'BHD', 'OMR'].includes(currency) ? 3 : 2;
}
export function formatPrice(amount, currency) {
  return amount.toFixed(decimalsFor(currency));
}

/**
 * Two-step purchase flow:
 *   1. Pick a token package.
 *   2. Run the TapPaymentModal for that package's amount.
 *   3. Caller's onPurchased({ tokens, amount, currency, referenceId }) fires.
 *
 * The Tap leg handles real-SDK or demo-fallback automatically — this modal
 * doesn't care which mode is active.
 */
// Pricing matches the Tap test merchant's configured currency (KWD).
// 1 KWD ≈ 3.25 USD, so a 0.250 KWD starter ≈ 80¢.
export const TOKEN_PACKAGES = [
  { id: 'starter', tokens: 5,   amount: 0.250, currency: 'KWD', label: 'Starter' },
  { id: 'pro',     tokens: 30,  amount: 1.500, currency: 'KWD', label: 'Pro',    popular: true },
  { id: 'power',   tokens: 100, amount: 5.000, currency: 'KWD', label: 'Power' }
];

export default function TokenPurchaseModal({
  open,
  customer,
  onPurchased,
  onCancel
}) {
  const [selectedId, setSelectedId] = useState('pro');
  const [paymentOpen, setPaymentOpen] = useState(false);

  if (!open) return null;
  const selected = TOKEN_PACKAGES.find((p) => p.id === selectedId);

  function startPayment() {
    setPaymentOpen(true);
  }

  function handlePaymentSuccess(tokenData) {
    setPaymentOpen(false);
    onPurchased?.({
      tokens: selected.tokens,
      amount: selected.amount,
      currency: selected.currency,
      referenceId: tokenData?.id || ''
    });
  }

  // While payment modal is open, render only that.
  if (paymentOpen) {
    return (
      <TapPaymentModal
        open
        amount={selected.amount}
        currency={selected.currency}
        customer={customer}
        onSuccess={handlePaymentSuccess}
        onCancel={() => setPaymentOpen(false)}
      />
    );
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal token-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onCancel}
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>

        <h3 className="modal-title icon-btn">
          <Coins size={18} /> Buy tokens
        </h3>
        <p className="modal-message">
          One token = one to-do you can add. Pick a package below.
        </p>

        <div className="package-grid">
          {TOKEN_PACKAGES.map((pkg) => {
            const isSelected = pkg.id === selectedId;
            const perToken = formatPrice(pkg.amount / pkg.tokens, pkg.currency);
            return (
              <button
                key={pkg.id}
                type="button"
                className={`package-card ${isSelected ? 'selected' : ''} ${pkg.popular ? 'popular' : ''}`}
                onClick={() => setSelectedId(pkg.id)}
              >
                {pkg.popular && (
                  <span className="package-flag">
                    <Sparkles size={11} /> Popular
                  </span>
                )}
                {isSelected && (
                  <span className="package-check" aria-hidden="true">
                    <Check size={14} />
                  </span>
                )}
                <span className="package-label">{pkg.label}</span>
                <span className="package-tokens">
                  <strong>{pkg.tokens}</strong> tokens
                </span>
                <span className="package-price">
                  {formatPrice(pkg.amount, pkg.currency)} {pkg.currency}
                </span>
                <span className="package-rate">{perToken} {pkg.currency} / token</span>
              </button>
            );
          })}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            onClick={onCancel}
            className="btn ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={startPayment}
            className="btn primary icon-btn"
          >
            <Coins size={14} /> Buy {selected.tokens} tokens · {formatPrice(selected.amount, selected.currency)} {selected.currency}
          </button>
        </div>
      </div>
    </div>
  );
}
