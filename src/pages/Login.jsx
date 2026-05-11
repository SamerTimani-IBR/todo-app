import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Share2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import ShareModal from '../components/ShareModal.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // No role pre-selection — Supabase returns the user's actual role on
      // the profile, and we route based on that. One login form for everyone.
      const session = await login({ email, password });
      navigate(session.role === 'admin' ? '/admin' : '/user', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-corner">
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="btn ghost icon-btn share-btn"
          aria-label="Share app"
          title="Share app"
        >
          <Share2 size={16} />
          <span className="btn-label">Share</span>
        </button>
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <h1 className="brand">Todo<span>App</span></h1>
        <p className="muted">Sign in to continue</p>

        <form onSubmit={handleSubmit} noValidate>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <PasswordInput
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="btn primary icon-btn" disabled={submitting}>
            <LogIn size={16} />
            {submitting ? 'Signing in…' : 'Log in'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>

        <p className="footer-line">
          New here? <Link to="/signup">Create a user account</Link>
        </p>

      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
