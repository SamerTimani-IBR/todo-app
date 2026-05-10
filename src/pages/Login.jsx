import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const session = await login({ email, password, role });
      navigate(session.role === 'admin' ? '/admin' : '/user', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-corner"><ThemeToggle /></div>
      <div className="auth-card">
        <h1 className="brand">Todo<span>App</span></h1>
        <p className="muted">Sign in to continue</p>

        <div className="role-switch" role="tablist">
          <button
            type="button"
            className={`role-tab ${role === 'user' ? 'active' : ''}`}
            onClick={() => setRole('user')}
          >
            User
          </button>
          <button
            type="button"
            className={`role-tab ${role === 'admin' ? 'active' : ''}`}
            onClick={() => setRole('admin')}
          >
            Admin
          </button>
        </div>

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
        <p className="hint">Admins cannot sign up — they are provisioned by the system.</p>
      </div>
    </div>
  );
}
