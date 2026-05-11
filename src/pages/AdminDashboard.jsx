import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Pin,
  Send,
  Trash2,
  LogOut,
  ShieldCheck,
  Receipt,
  Download,
  RefreshCw,
  Users,
  ListTodo,
  Coins,
  DollarSign,
  TrendingUp,
  Activity,
  Share2
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import * as db from '../lib/db.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ShareModal from '../components/ShareModal.jsx';
import { useToast } from '../components/Toast.jsx';
import { SkeletonLine, SkeletonBlock } from '../components/Skeleton.jsx';
import {
  RevenueChart,
  StatusDonut,
  useRevenueSeries,
  useStatusBreakdown
} from '../components/AdminCharts.jsx';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'announcement', label: 'Announcement' },
  { id: 'users', label: 'Users' },
  { id: 'transactions', label: 'Transactions' }
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [activeSection, setActiveSection] = useState('overview');

  const [word, setWord] = useState(null);
  const [draft, setDraft] = useState('');
  const [wordLoading, setWordLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txFilter, setTxFilter] = useState('all');

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [shareOpen, setShareOpen] = useState(false);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userFilter, setUserFilter] = useState('');

  // ---------- initial load ----------
  useEffect(() => {
    let mounted = true;
    db.getWordOfDay()
      .then((current) => {
        if (!mounted) return;
        setWord(current);
        setDraft(current?.message || '');
      })
      .finally(() => mounted && setWordLoading(false));

    loadAll(mounted);
    return () => { mounted = false; };
  }, []);

  function loadAll(mounted = true) {
    setStatsLoading(true);
    setTxLoading(true);
    setUsersLoading(true);

    db.getAdminStats()
      .then((s) => mounted && setStats(s))
      .catch((err) => toast.error('Could not load stats: ' + err.message))
      .finally(() => mounted && setStatsLoading(false));

    db.getAllTransactions({ limit: 500 })
      .then((list) => mounted && setTransactions(list))
      .catch((err) => toast.error('Could not load transactions: ' + err.message))
      .finally(() => mounted && setTxLoading(false));

    db.getAllUsers()
      .then((list) => mounted && setUsers(list))
      .catch((err) => toast.error('Could not load users: ' + err.message))
      .finally(() => mounted && setUsersLoading(false));
  }

  // ---------- word of day ----------
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

  // ---------- derived ----------
  const visibleTransactions = useMemo(() => {
    if (txFilter === 'all') return transactions;
    return transactions.filter((t) => t.status === txFilter);
  }, [transactions, txFilter]);

  const txStats = useMemo(() => {
    const completed = transactions.filter((t) => t.status === 'completed');
    return {
      total: transactions.length,
      completedCount: completed.length,
      failedCount: transactions.filter((t) => t.status === 'failed').length,
      revenue: completed.reduce((sum, t) => sum + t.amount, 0),
      tokensSold: completed.reduce((sum, t) => sum + t.tokensAdded, 0)
    };
  }, [transactions]);

  const visibleUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, userFilter]);

  // 7-day revenue series and status breakdown for the overview charts.
  const revenueSeries = useRevenueSeries(transactions, 7);
  const statusBreakdown = useStatusBreakdown(transactions);
  const txCurrency = transactions[0]?.currency || 'USD';

  function downloadCSV() {
    const headers = [
      'id',
      'user_id',
      'username',
      'status',
      'amount',
      'currency',
      'tokens_added',
      'reference_id',
      'created_at'
    ];
    const escape = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      headers.join(','),
      ...visibleTransactions.map((t) =>
        [
          t.id,
          t.userId,
          t.username,
          t.status,
          t.amount.toFixed(2),
          t.currency,
          t.tokensAdded,
          t.referenceId,
          new Date(t.createdAt).toISOString()
        ].map(escape).join(',')
      )
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visibleTransactions.length} rows.`);
  }

  return (
    <>
      <header className="topbar admin glass">
        <h1 className="brand">
          Todo<span>App</span>
          <span className="badge"><ShieldCheck size={11} /> ADMIN</span>
        </h1>
        <div className="user-pill">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="btn ghost icon-btn"
            aria-label="Share app"
            title="Share app"
          >
            <Share2 size={16} />
            <span className="btn-label">Share</span>
          </button>
          <ThemeToggle />
          <span className="user-name">{user.name || user.email}</span>
          <button onClick={handleLogout} className="btn ghost icon-btn" aria-label="Log out">
            <LogOut size={16} />
            <span className="btn-label">Log out</span>
          </button>
        </div>
      </header>

      <main className="container admin-container">
        {/* ---------- Section nav ---------- */}
        <nav className="admin-nav" role="tablist" aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={activeSection === s.id}
              className={`admin-nav-item ${activeSection === s.id ? 'active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => loadAll(true)}
            className="btn ghost small icon-btn admin-nav-refresh"
            disabled={statsLoading || txLoading || usersLoading}
            title="Refresh"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </nav>

        {/* ---------- OVERVIEW ---------- */}
        {activeSection === 'overview' && (
          <>
            <HeroStats stats={stats} loading={statsLoading} />

            <div className="charts-row">
              <section className="card chart-card">
                <div className="card-header">
                  <h2 className="icon-btn"><TrendingUp size={18}/> Revenue · last 7 days</h2>
                  {!txLoading && revenueSeries.length > 0 && (
                    <small className="muted">
                      {revenueSeries.reduce((s, d) => s + d.count, 0)} transactions
                    </small>
                  )}
                </div>
                {txLoading ? (
                  <SkeletonBlock height="220px" />
                ) : (
                  <RevenueChart data={revenueSeries} currency={txCurrency} />
                )}
              </section>

              <section className="card chart-card chart-card-narrow">
                <div className="card-header">
                  <h2 className="icon-btn"><Activity size={18}/> Status breakdown</h2>
                </div>
                {txLoading ? (
                  <SkeletonBlock height="220px" />
                ) : (
                  <StatusDonut data={statusBreakdown} />
                )}
              </section>
            </div>

            <section className="card admin-mini-card">
              <div className="card-header">
                <h2 className="icon-btn"><Activity size={18}/> Recent activity</h2>
                <small className="muted">Last 5 transactions</small>
              </div>
              {txLoading ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {[0,1,2].map(i => <SkeletonBlock key={i} height="38px" />)}
                </div>
              ) : transactions.length === 0 ? (
                <p className="muted empty">No transactions yet.</p>
              ) : (
                <ul className="activity-list">
                  {transactions.slice(0, 5).map((t) => (
                    <li key={t.id} className="activity-item">
                      <span className={`tx-status tx-status-${t.status}`}>{t.status}</span>
                      <div className="activity-body">
                        <strong>{t.username || '(no name)'}</strong>
                        <span className="muted small">
                          {t.tokensAdded > 0 ? `+${t.tokensAdded} tokens` : 'no tokens'} ·
                          {' '}${t.amount.toFixed(2)} {t.currency}
                        </span>
                      </div>
                      <time className="muted small">
                        {new Date(t.createdAt).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {/* ---------- ANNOUNCEMENT ---------- */}
        {activeSection === 'announcement' && (
          <section className="card">
            <div className="card-header">
              <h2 className="icon-btn"><Pin size={18}/> Word of the day</h2>
              <small className="muted">
                Live to every user · {draft.length}/500 chars
              </small>
            </div>
            <p className="muted">
              Anything you save here is pinned at the top of every user's dashboard, instantly.
            </p>

            <div className="announcement-grid">
              <form onSubmit={handlePublish} className="word-form">
                <textarea
                  rows={5}
                  value={draft}
                  maxLength={500}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type the word of the day…"
                  required
                  disabled={wordLoading}
                />
                <div className="row">
                  <button
                    type="submit"
                    className="btn primary icon-btn"
                    disabled={saving || wordLoading}
                  >
                    <Send size={16} />{saving ? 'Publishing…' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="btn ghost icon-btn"
                    disabled={saving || wordLoading}
                  >
                    <Trash2 size={16} /> Clear
                  </button>
                </div>
              </form>

              <div className="announcement-preview">
                <div className="announcement-preview-label">Live preview</div>
                <div className="pinned readonly">
                  <div className="pin-icon" aria-hidden="true">
                    <Pin size={14} />
                  </div>
                  <div className="pin-body">
                    {wordLoading ? (
                      <>
                        <SkeletonLine width="60%" height="16px" />
                        <SkeletonLine width="35%" height="11px" className="mt-6" />
                      </>
                    ) : draft.trim() || word ? (
                      <>
                        <p className="pin-text">
                          {draft.trim() || word?.message}
                        </p>
                        <small className="muted">
                          {draft.trim() && draft.trim() !== word?.message ? (
                            'Unpublished change'
                          ) : word ? (
                            <>Posted by {word.updatedBy} · {new Date(word.updatedAt).toLocaleString()}</>
                          ) : null}
                        </small>
                      </>
                    ) : (
                      <p className="pin-text muted">Nothing published yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ---------- USERS ---------- */}
        {activeSection === 'users' && (
          <section className="card">
            <div className="card-header">
              <h2 className="icon-btn"><Users size={18}/> Users</h2>
              <input
                type="search"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder="Search by name, email, role…"
                className="search-input"
                style={{ maxWidth: 260 }}
              />
            </div>

            {usersLoading ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {[0,1,2,3].map(i => <SkeletonBlock key={i} height="44px" />)}
              </div>
            ) : visibleUsers.length === 0 ? (
              <p className="muted empty">No users match.</p>
            ) : (
              <div className="tx-table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th className="num">Tokens</th>
                      <th className="num">To-dos</th>
                      <th className="num">Spent</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((u) => (
                      <tr key={u.id}>
                        <td><strong>{u.name || <span className="muted">(no name)</span>}</strong></td>
                        <td className="muted">{u.email}</td>
                        <td>
                          <span className={`role-pill role-${u.role}`}>
                            {u.role === 'admin' && <ShieldCheck size={10} />} {u.role}
                          </span>
                        </td>
                        <td className="num">{u.tokens}</td>
                        <td className="num">{u.todosCount}</td>
                        <td className="num">${u.totalSpent.toFixed(2)}</td>
                        <td>
                          <time>
                            {new Date(u.createdAt).toLocaleDateString(undefined, {
                              dateStyle: 'medium'
                            })}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ---------- TRANSACTIONS ---------- */}
        {activeSection === 'transactions' && (
          <section className="card">
            <div className="card-header">
              <h2 className="icon-btn"><Receipt size={18}/> Transactions</h2>
              <button
                type="button"
                onClick={downloadCSV}
                className="btn primary icon-btn small"
                disabled={txLoading || visibleTransactions.length === 0}
                title="Download as CSV"
              >
                <Download size={14} />
                Export CSV
              </button>
            </div>

            <div className="stats-grid">
              <StatCard label="Total" value={txStats.total} loading={txLoading} />
              <StatCard label="Completed" value={txStats.completedCount} loading={txLoading} accent="success" />
              <StatCard label="Failed" value={txStats.failedCount} loading={txLoading} accent="danger" />
              <StatCard
                label="Revenue"
                value={`$${txStats.revenue.toFixed(2)}`}
                loading={txLoading}
                accent="primary"
              />
              <StatCard label="Tokens sold" value={txStats.tokensSold} loading={txLoading} />
            </div>

            <div className="filter-tabs" role="tablist">
              {['all', 'completed', 'failed', 'refunded'].map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={txFilter === f}
                  className={`filter-tab ${txFilter === f ? 'active' : ''}`}
                  onClick={() => setTxFilter(f)}
                >
                  {f[0].toUpperCase() + f.slice(1)}
                  <span className="filter-count">
                    {f === 'all'
                      ? transactions.length
                      : transactions.filter((t) => t.status === f).length}
                  </span>
                </button>
              ))}
            </div>

            {txLoading ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {[0,1,2].map(i => <SkeletonBlock key={i} height="40px" />)}
              </div>
            ) : visibleTransactions.length === 0 ? (
              <p className="muted empty">No transactions to show.</p>
            ) : (
              <div className="tx-table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th className="num">Amount</th>
                      <th className="num">Tokens</th>
                      <th>Reference</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTransactions.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className="tx-user">
                            <strong>{t.username || '(no name)'}</strong>
                            <small className="muted">{t.userId.slice(0, 8)}…</small>
                          </div>
                        </td>
                        <td>
                          <span className={`tx-status tx-status-${t.status}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="num">
                          ${t.amount.toFixed(2)} <small className="muted">{t.currency}</small>
                        </td>
                        <td className="num">{t.tokensAdded}</td>
                        <td className="ref">
                          {t.referenceId ? <code>{t.referenceId.slice(0, 16)}…</code> : <span className="muted">—</span>}
                        </td>
                        <td>
                          <time dateTime={new Date(t.createdAt).toISOString()}>
                            {new Date(t.createdAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}

/* ---------- Hero stats strip ---------- */
function HeroStats({ stats, loading }) {
  const cards = [
    {
      label: 'Total users',
      value: stats?.userCount,
      icon: <Users size={18} />,
      accent: 'users'
    },
    {
      label: 'To-dos',
      value: stats?.todoCount,
      subline: stats ? `${stats.completedTodoCount} completed` : null,
      icon: <ListTodo size={18} />,
      accent: 'todos'
    },
    {
      label: 'Tokens in circulation',
      value: stats?.tokensInCirculation,
      icon: <Coins size={18} />,
      accent: 'tokens'
    },
    {
      label: 'Revenue today',
      value: stats != null ? `$${stats.revenueToday.toFixed(2)}` : null,
      subline:
        stats != null
          ? `${stats.transactionsToday} tx today`
          : null,
      icon: <TrendingUp size={18} />,
      accent: 'revenue'
    },
    {
      label: 'Total revenue',
      value: stats != null ? `$${stats.revenueTotal.toFixed(2)}` : null,
      icon: <DollarSign size={18} />,
      accent: 'primary'
    }
  ];
  return (
    <div className="hero-stats">
      {cards.map((c, i) => (
        <div key={i} className={`hero-stat hero-stat-${c.accent}`}>
          <div className="hero-stat-icon">{c.icon}</div>
          <div className="hero-stat-body">
            <div className="hero-stat-label">{c.label}</div>
            <div className="hero-stat-value">
              {loading || c.value == null
                ? <SkeletonLine width="60%" height="24px" />
                : c.value}
            </div>
            {c.subline && <div className="hero-stat-subline muted small">{c.subline}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, loading, accent }) {
  return (
    <div className={`stat-card ${accent ? `stat-${accent}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {loading ? <SkeletonLine width="60%" height="22px" /> : value}
      </div>
    </div>
  );
}
