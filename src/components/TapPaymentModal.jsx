import { useEffect, useRef, useState } from 'react';
import { CreditCard, Lock, X as CloseIcon, Info, Sparkles } from 'lucide-react';
import { loadTapSDK } from '../lib/tapSDK.js';

// 3 decimals for KWD/BHD/OMR (fils), 2 otherwise.
function fmt(amount, currency) {
  const decimals = ['KWD', 'BHD', 'OMR'].includes(currency) ? 3 : 2;
  return amount.toFixed(decimals);
}

/**
 * Tap Payments — Card SDK V2 modal with a built-in demo fallback.
 *
 * Two modes:
 *   • Real Tap SDK — engaged when both VITE_TAP_PUBLIC_KEY and
 *     VITE_TAP_MERCHANT_ID are set in .env. Mounts Tap's secure iframe.
 *   • Demo mode    — engaged when no merchant_id is configured. Renders our
 *     own card form, simulates tokenization for ~1 second, returns a token
 *     prefixed with `tok_demo_` so downstream code can run end-to-end without
 *     a real Tap account.
 *
 * Both modes call onSuccess with the same shape:
 *   { id, card: { brand, last_four } }
 */
export default function TapPaymentModal({
  open,
  amount,
  currency = 'USD',
  customer,
  onSuccess,
  onCancel
}) {
  const publicKey = import.meta.env.VITE_TAP_PUBLIC_KEY;
  const merchantId = import.meta.env.VITE_TAP_MERCHANT_ID || '';

  // Decide which mode to use the moment the modal opens.
  const demoMode = !publicKey || !merchantId;

  if (!open) return null;

  return demoMode ? (
    <DemoPaymentModal
      amount={amount}
      currency={currency}
      reason={
        !publicKey
          ? 'No Tap public key configured.'
          : 'No Tap merchant id configured — the SDK iframe needs one to authenticate.'
      }
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  ) : (
    <RealTapModal
      amount={amount}
      currency={currency}
      customer={customer}
      publicKey={publicKey}
      merchantId={merchantId}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  );
}

/* =====================================================================
 * Demo mode — custom card form, fake tokenization
 * =====================================================================*/

function DemoPaymentModal({ amount, currency, reason, onSuccess, onCancel }) {
  const [number, setNumber] = useState('5123 4500 0000 0008');
  const [expiry, setExpiry] = useState('12/30');
  const [cvv, setCvv] = useState('100');
  const [name, setName] = useState('Test User');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  function formatNumber(raw) {
    return raw
      .replace(/\D/g, '')
      .slice(0, 19)
      .match(/.{1,4}/g)
      ?.join(' ') || '';
  }

  function formatExpiry(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length < 3) return digits;
    return digits.slice(0, 2) + '/' + digits.slice(2);
  }

  function brandFromNumber(num) {
    const d = num.replace(/\s/g, '');
    if (/^4/.test(d)) return 'VISA';
    if (/^5[1-5]/.test(d)) return 'MASTERCARD';
    if (/^3[47]/.test(d)) return 'AMERICAN_EXPRESS';
    return 'UNKNOWN';
  }

  async function handlePay(e) {
    e.preventDefault();
    setError('');
    const digits = number.replace(/\s/g, '');
    if (digits.length < 13) {
      setError('Card number looks too short.');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      setError('Expiry must be in MM/YY format.');
      return;
    }
    if (cvv.length < 3) {
      setError('CVV must be at least 3 digits.');
      return;
    }

    setPaying(true);
    // Simulate the network round-trip Tap would make.
    await new Promise((r) => setTimeout(r, 900));

    const tokenData = {
      id:
        'tok_demo_' +
        Math.random().toString(36).slice(2, 10) +
        Date.now().toString(36),
      card: {
        brand: brandFromNumber(digits),
        last_four: digits.slice(-4)
      }
    };
    setPaying(false);
    onSuccess?.(tokenData);
  }

  return (
    <div
      className="modal-backdrop"
      onClick={paying ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal payment-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onCancel}
          aria-label="Close"
          disabled={paying}
        >
          <CloseIcon size={18} />
        </button>

        <h3 className="modal-title icon-btn">
          <CreditCard size={18} /> Complete payment
        </h3>
        <p className="modal-message">
          Charge <strong>{fmt(amount, currency)} {currency}</strong> to complete your purchase.
        </p>

        <div className="demo-banner">
          <Sparkles size={14} aria-hidden="true" />
          <span>
            <strong>Demo mode</strong> — {reason} No real payment is being
            made. Add a merchant id from <code>os.tap.company</code> to switch to the
            live Tap SDK iframe.
          </span>
        </div>

        <form onSubmit={handlePay} className="demo-card-form">
          <label>
            <span>Cardholder name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="cc-name"
              required
            />
          </label>
          <label>
            <span>Card number</span>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(formatNumber(e.target.value))}
              inputMode="numeric"
              autoComplete="cc-number"
              required
            />
          </label>
          <div className="demo-card-row">
            <label>
              <span>Expiry</span>
              <input
                type="text"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                placeholder="MM/YY"
                inputMode="numeric"
                autoComplete="cc-exp"
                required
              />
            </label>
            <label>
              <span>CVV</span>
              <input
                type="text"
                value={cvv}
                onChange={(e) =>
                  setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                inputMode="numeric"
                autoComplete="cc-csc"
                required
              />
            </label>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="modal-actions">
            <button
              type="button"
              onClick={onCancel}
              className="btn ghost"
              disabled={paying}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary icon-btn"
              disabled={paying}
            >
              {paying ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Processing…
                </>
              ) : (
                <>
                  <Lock size={14} /> Pay {fmt(amount, currency)} {currency}
                </>
              )}
            </button>
          </div>
        </form>

        <p className="hint" style={{ marginTop: 16, textAlign: 'center' }}>
          Demo Tap integration · The same code path runs against the real SDK
        </p>
      </div>
    </div>
  );
}

/* =====================================================================
 * Real Tap Card SDK V2 mode
 * =====================================================================*/

function RealTapModal({
  amount,
  currency,
  customer,
  publicKey,
  merchantId,
  onSuccess,
  onCancel
}) {
  const containerRef = useRef(null);
  const unmountRef = useRef(null);
  const tokenizeTimerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [formReady, setFormReady] = useState(false);
  const [formValid, setFormValid] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setPaying(false);
    setLoading(true);
    setFormReady(false);
    setFormValid(false);

    let mounted = true;

    loadTapSDK()
      .then((CardSDK) => {
        if (!mounted || !containerRef.current) return;

        const { renderTapCard, Theme, Currencies, Locale, Edges, Direction } =
          CardSDK;
        const themeName =
          document.documentElement.dataset.theme === 'dark'
            ? Theme.DARK
            : Theme.LIGHT;

        console.log('[tap] mounting card form', {
          publicKey: publicKey.slice(0, 12) + '…',
          merchantId,
          amount,
          currency
        });

        try {
          // The SDK's first arg is an element ID string (it calls
          // document.getElementById on it). Passing the DOM element directly
          // makes getElementById return null and the SDK falls back to
          // `document.body.prepend(...)` — that's why the iframe was rendering
          // at the top of the page instead of inside our modal.
          const result = renderTapCard('tap-card-mount', {
            publicKey,
            merchant: { id: merchantId },
            transaction: {
              amount,
              currency: Currencies[currency] || Currencies.USD
            },
            customer: {
              // Pre-fills the Card Holder Name field so the user doesn't
              // have to type it. Both first/last must be non-empty and
              // reasonably long for Tap's validation to pass.
              name: [
                {
                  lang: Locale.EN,
                  first: (customer?.firstName || 'Test').slice(0, 30),
                  last: (customer?.lastName || 'User').slice(0, 30)
                }
              ],
              contact: { email: customer?.email || '' }
            },
            acceptance: {
              supportedBrands: [
                'VISA',
                'MASTERCARD',
                'AMERICAN_EXPRESS',
                'MADA'
              ],
              supportedCards: 'ALL'
            },
            // The SDK destructures `addons` from options and reads
            // `addons.loader` without a null check — must be present.
            addons: {
              loader: true,
              displayPaymentBrands: true,
              displayPaymentList: true
            },
            // SDK reads these field flags directly so we must pass them.
            // Tap's server requires cardHolder for tokenization — keep it on.
            // We pre-fill the name from customer.name below so the user
            // doesn't have to type it themselves.
            fields: {
              cardHolder: true,
              cardNumber: true,
              expiry: true,
              cvv: true
            },
            interface: {
              locale: Locale.EN,
              theme: themeName,
              edges: Edges.CURVED,
              direction: Direction.LTR
            },
            onReady: () => {
              console.log('[tap] form ready');
              if (mounted) setFormReady(true);
            },
            onValidInput: () => {
              if (mounted) {
                setFormValid(true);
                setError('');
              }
            },
            onInvalidInput: () => {
              if (mounted) setFormValid(false);
            },
            onSuccess: (tokenData) => {
              console.log('[tap] tokenized:', tokenData);
              clearTimeout(tokenizeTimerRef.current);
              setPaying(false);
              onSuccess?.(tokenData);
            },
            onError: (err) => {
              console.error('[tap] error:', err);
              clearTimeout(tokenizeTimerRef.current);
              setPaying(false);
              setError(err?.message || JSON.stringify(err) || 'Payment failed.');
            }
          });

          unmountRef.current = result?.unmount;
          setLoading(false);

          setTimeout(() => {
            if (mounted && containerRef.current?.children?.length > 0) {
              setFormReady(true);
            }
          }, 1500);
        } catch (err) {
          setError('renderTapCard failed: ' + (err?.message || String(err)));
          setLoading(false);
        }
      })
      .catch((err) => {
        setError('Could not load Tap SDK: ' + err.message);
        setLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(tokenizeTimerRef.current);
      try {
        unmountRef.current?.();
      } catch {}
      unmountRef.current = null;
    };
  }, [amount, currency, publicKey, merchantId, customer?.email]);

  function handlePay() {
    if (!formReady) {
      setError('Please wait — the card form is still loading.');
      return;
    }
    if (!window.CardSDK?.tokenize) {
      setError('SDK not ready. Try closing and reopening this dialog.');
      return;
    }
    setPaying(true);
    setError('');
    try {
      window.CardSDK.tokenize();
      tokenizeTimerRef.current = setTimeout(() => {
        setPaying(false);
        setError('Payment timed out. Check the card details and try again.');
      }, 30000);
    } catch (err) {
      setPaying(false);
      setError(err?.message || 'Tokenization failed.');
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={paying ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal payment-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onCancel}
          aria-label="Close"
          disabled={paying}
        >
          <CloseIcon size={18} />
        </button>

        <h3 className="modal-title icon-btn">
          <CreditCard size={18} /> Complete payment
        </h3>
        <p className="modal-message">
          Charge <strong>{fmt(amount, currency)} {currency}</strong> to complete your purchase.
        </p>

        <div className="test-card-hint">
          <Info size={14} aria-hidden="true" />
          <span>
            <strong>Test mode</strong> — try card{' '}
            <code>5123 4500 0000 0008</code>, CVV <code>100</code>, any future
            expiry. No real money will be charged.
          </span>
        </div>

        <div
          id="tap-card-mount"
          ref={containerRef}
          className="tap-card-mount"
        />

        {loading && !error && (
          <p className="muted small">Loading secure payment form…</p>
        )}
        {!loading && !formReady && !error && (
          <p className="muted small">Waiting for card form to be ready…</p>
        )}
        {!loading && formReady && !error && (
          <p className="muted small">
            Fill in card number, expiry, CVV and cardholder name, then click Pay.
            Cardholder name is pre-filled from your profile.
          </p>
        )}
        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button
            type="button"
            onClick={onCancel}
            className="btn ghost"
            disabled={paying}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePay}
            className="btn primary icon-btn"
            disabled={paying || loading || !formReady}
            title={
              !formReady
                ? 'Card form is still loading'
                : 'Click to tokenize and pay'
            }
          >
            {paying ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Processing…
              </>
            ) : (
              <>
                <Lock size={14} /> Pay {fmt(amount, currency)} {currency}
              </>
            )}
          </button>
        </div>

        <p className="hint" style={{ marginTop: 16, textAlign: 'center' }}>
          Powered by Tap Payments · Your card details never touch our servers
        </p>
      </div>
    </div>
  );
}
