import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, Send, Trash2, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import * as db from '../lib/db.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { useToast } from '../components/Toast.jsx';
import { SkeletonLine } from '../components/Skeleton.jsx';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [word, setWord] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    db.getWordOfDay()
      .then((current) => {
        if (!mounted) return;
        setWord(current);
        setDraft(current?.message || '');
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  async function handlePublish(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const entry = await db.setWordOfDay(draft, user.name || 'Admin');
      setWord(entry);
      toast.success('Published — every user sees it live.');
    } catch (err) {
      toast.error('Could not publish: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await db.clearWordOfDay();
      setWord(null);
      setDraft('');
      toast.success('Cleared.');
    } catch (err) {
      toast.error('Could not clear: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <header className="topbar admin glass">
        <h1 className="brand">
          Todo<span>App</span>
          <span className="badge"><ShieldCheck size={11} /> ADMIN</span>
        </h1>
        <div className="user-pill">
          <ThemeToggle />
          <span className="user-name">{user.name || user.email}</span>
          <button onClick={handleLogout} className="btn ghost icon-btn" aria-label="Log out">
            <LogOut size={16} />
            <span className="btn-label">Log out</span>
          </button>
        </div>
      </header>

      <main className="container">
        <section className="card">
          <h2>Word of the day</h2>
          <p className="muted">
            Whatever you save here appears pinned at the top of every user's dashboard — instantly.
          </p>

          <form onSubmit={handlePublish} className="word-form">
            <textarea
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type the word of the day…"
              required
              disabled={loading}
            />
            <div className="row">
              <button type="submit" className="btn primary icon-btn" disabled={saving || loading}>
                <Send size={16} /> {saving ? 'Publishing…' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="btn ghost icon-btn"
                disabled={saving || loading}
              >
                <Trash2 size={16} /> Clear
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <h2>Current pinned message</h2>
          <div className="pinned readonly">
            <div className="pin-icon" aria-hidden="true">
              <Pin size={14} />
            </div>
            <div className="pin-body">
              {loading ? (
                <>
                  <SkeletonLine width="55%" height="16px" />
                  <SkeletonLine width="35%" height="11px" className="mt-6" />
                </>
              ) : word ? (
                <>
                  <p className="pin-text">{word.message}</p>
                  <small className="muted">
                    Posted by {word.updatedBy} · {new Date(word.updatedAt).toLocaleString()}
                  </small>
                </>
              ) : (
                <p className="pin-text muted">Nothing published yet.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
