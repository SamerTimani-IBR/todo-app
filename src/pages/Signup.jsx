import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await signUp({ name, email, password });
      navigate('/user', { replace: true });
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
        <p className="muted">Create your user account</p>

        <form onSubmit={handleSubmit} noValidate>
          <label>
            Full name
            <input
              type="text"
              value={name}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
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
              autoComplete="new-password"
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Confirm password
            <PasswordInput
              value={confirm}
              autoComplete="new-password"
              minLength={6}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="btn primary icon-btn" disabled={submitting}>
            <UserPlus size={16} />
            {submitting ? 'Creating…' : 'Create account'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>

        <p className="footer-line">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
        <p className="hint">Only users can sign up here.</p>
      </div>
    </div>
  );
}
