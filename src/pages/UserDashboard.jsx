import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Check,
  X,
  Pin,
  LogOut,
  Inbox,
  Clock,
  CheckCheck
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import * as db from '../lib/db.js';
import { supabase } from '../lib/supabaseClient.js';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useToast } from '../components/Toast.jsx';
import { TodoSkeletonList, SkeletonLine } from '../components/Skeleton.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' }
];

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [todos, setTodos] = useState([]);
  const [word, setWord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wordLoading, setWordLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const fileInputRef = useRef(null);

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editImageMode, setEditImageMode] = useState('keep'); // 'keep' | 'replace' | 'remove'
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const editFileInputRef = useRef(null);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState(null);
  const [confirmDeleteBusy, setConfirmDeleteBusy] = useState(false);

  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  // ------- initial load -------
  useEffect(() => {
    let mounted = true;
    db.getTodos(user.id)
      .then((t) => {
        if (mounted) setTodos(t);
      })
      .catch((err) => toast.error('Could not load to-dos: ' + err.message))
      .finally(() => mounted && setLoading(false));

    db.getWordOfDay()
      .then((w) => mounted && setWord(w))
      .finally(() => mounted && setWordLoading(false));

    return () => { mounted = false; };
  }, [user.id]);

  // ------- realtime word-of-day -------
  useEffect(() => {
    const channel = supabase
      .channel('word_of_day_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'word_of_day', filter: 'id=eq.1' },
        (payload) => {
          const row = payload.new;
          if (!row || !row.message) {
            setWord(null);
            return;
          }
          setWord({
            message: row.message,
            updatedAt: new Date(row.updated_at).getTime(),
            updatedBy: row.updated_by
          });
          toast.info('Admin updated the pinned message.');
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ------- preview cleanup -------
  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  // ------- keyboard: '/' focuses search -------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ------- derived: visible todos -------
  const counts = useMemo(() => {
    const active = todos.filter((t) => !t.completed).length;
    const completed = todos.filter((t) => t.completed).length;
    return { all: todos.length, active, completed };
  }, [todos]);

  const visibleTodos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todos.filter((t) => {
      if (filter === 'active' && t.completed) return false;
      if (filter === 'completed' && !t.completed) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.note && t.note.toLowerCase().includes(q))
      );
    });
  }, [todos, filter, query]);

  // ------- image picker -------
  function pickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAddError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAddError('Image must be 5 MB or smaller.');
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setAddError('');
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ------- add -------
  async function handleAdd(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const created = await db.addTodo(user.id, { title, note, imageFile });
      setTodos((prev) => [created, ...prev]);
      setTitle('');
      setNote('');
      clearImage();
      toast.success('To-do added.');
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  }

  // ------- toggle (optimistic) -------
  function handleCheckboxClick(t, e) {
    e.preventDefault();
    if (!t.completed) {
      setConfirmTarget(t);
    } else {
      runToggle(t);
    }
  }

  async function runToggle(t) {
    const prevTodos = todos;
    const optimistic = todos.map((x) =>
      x.id === t.id ? { ...x, completed: !x.completed } : x
    );
    setTodos(optimistic);
    try {
      await db.updateTodo(t.id, { completed: !t.completed });
      toast.success(t.completed ? 'Marked incomplete.' : 'Marked complete!');
    } catch (err) {
      setTodos(prevTodos);
      toast.error('Failed to update: ' + err.message);
      throw err;
    }
  }

  async function handleConfirmComplete() {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      await runToggle(confirmTarget);
      setConfirmTarget(null);
    } catch {
      // toast already fired; keep modal open
    } finally {
      setConfirmBusy(false);
    }
  }

  // ------- edit -------
  function startEdit(t) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditNote(t.note || '');
    resetEditImageState();
  }

  function resetEditImageState() {
    if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditImageMode('keep');
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditNote('');
    resetEditImageState();
  }

  function pickEditImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.');
      return;
    }
    if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    setEditImageFile(file);
    setEditImagePreview(URL.createObjectURL(file));
    setEditImageMode('replace');
  }

  function markImageForRemoval() {
    if (editImagePreview) URL.revokeObjectURL(editImagePreview);
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditImageMode('remove');
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  }

  function revertImageEdit() {
    resetEditImageState();
  }

  async function saveEdit(t) {
    if (!editTitle.trim()) return;
    setSavingEdit(true);
    try {
      const updates = {
        title: editTitle.trim(),
        note: editNote.trim()
      };
      if (editImageMode === 'replace' && editImageFile) {
        updates.imageFile = editImageFile;
      } else if (editImageMode === 'remove') {
        updates.removeImage = true;
      }
      const updated = await db.updateTodo(t.id, updates);
      setTodos((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
      cancelEdit();
      toast.success('Saved.');
    } catch (err) {
      toast.error('Could not save: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  // ------- delete (with confirm) -------
  function handleDeleteClick(todo) {
    setConfirmDeleteTarget(todo);
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteTarget) return;
    const target = confirmDeleteTarget;
    setConfirmDeleteBusy(true);
    try {
      await db.deleteTodo(target.id);
      setTodos((prev) => prev.filter((t) => t.id !== target.id));
      toast.success('To-do deleted.');
      setConfirmDeleteTarget(null);
    } catch (err) {
      toast.error('Could not delete: ' + err.message);
    } finally {
      setConfirmDeleteBusy(false);
    }
  }

  // ------- logout -------
  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <header className="topbar glass">
        <h1 className="brand">Todo<span>App</span></h1>
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
        <PinnedWord word={word} loading={wordLoading} />

        <section className="card">
          <div className="card-header">
            <h2>My to-dos</h2>
            <div className="search-wrap">
              <Search size={16} className="search-icon" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search to-dos…"
                className="search-input"
                aria-label="Search to-dos"
              />
              {query ? (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd className="kbd-hint" aria-hidden="true">/</kbd>
              )}
            </div>
          </div>

          <form onSubmit={handleAdd} className="todo-form">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to get done?"
              required
            />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
            />
            <label className="btn ghost icon-btn file-btn" title="Attach an image">
              <input
                type="file"
                accept="image/*"
                onChange={pickImage}
                ref={fileInputRef}
                hidden
              />
              <ImageIcon size={16} />
              {imageFile ? 'Image ready' : 'Image'}
            </label>
            <button type="submit" className="btn primary icon-btn" disabled={adding}>
              <Plus size={16} />
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>

          {imagePreview && (
            <div className="preview-row">
              <img src={imagePreview} alt="Preview" className="preview-thumb" />
              <span className="muted small">{imageFile?.name}</span>
              <button type="button" onClick={clearImage} className="btn ghost small icon-btn">
                <X size={14} /> Remove
              </button>
            </div>
          )}

          {addError && <p className="error">{addError}</p>}

          <div className="filter-tabs" role="tablist" aria-label="Filter to-dos">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={`filter-tab ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span className="filter-count">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <TodoSkeletonList count={3} />
          ) : visibleTodos.length === 0 ? (
            <EmptyState
              filter={filter}
              hasQuery={query.length > 0}
              totalCount={counts.all}
            />
          ) : (
            <ul className="todo-list">
              {visibleTodos.map((t) => (
                <li key={t.id} className={`todo-item ${t.completed ? 'done' : ''}`}>
                  {editingId === t.id ? (
                    <div className="todo-edit">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        autoFocus
                      />
                      <input
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Note"
                      />

                      <div className="edit-image-row">
                        {editImageMode === 'replace' && editImagePreview ? (
                          <>
                            <img src={editImagePreview} alt="" className="edit-image-thumb" />
                            <span className="edit-image-label">
                              <strong>New image</strong>
                              <small className="muted">{editImageFile?.name}</small>
                            </span>
                            <button
                              type="button"
                              onClick={revertImageEdit}
                              className="btn ghost small icon-btn"
                            >
                              <X size={14} /> Cancel change
                            </button>
                          </>
                        ) : editImageMode === 'remove' ? (
                          <>
                            <div className="edit-image-thumb empty">
                              <Trash2 size={18} />
                            </div>
                            <span className="edit-image-label">
                              <strong>Image will be removed</strong>
                              <small className="muted">on save</small>
                            </span>
                            <button
                              type="button"
                              onClick={revertImageEdit}
                              className="btn ghost small"
                            >
                              Undo
                            </button>
                          </>
                        ) : t.imageUrl ? (
                          <>
                            <img src={t.imageUrl} alt="" className="edit-image-thumb" />
                            <span className="edit-image-label">
                              <strong>Current image</strong>
                            </span>
                            <label className="btn ghost small icon-btn">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={pickEditImage}
                                ref={editFileInputRef}
                                hidden
                              />
                              <ImageIcon size={14} /> Replace
                            </label>
                            <button
                              type="button"
                              onClick={markImageForRemoval}
                              className="btn danger small icon-btn"
                            >
                              <Trash2 size={14} /> Remove
                            </button>
                          </>
                        ) : (
                          <label className="btn ghost small icon-btn">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={pickEditImage}
                              ref={editFileInputRef}
                              hidden
                            />
                            <ImageIcon size={14} /> Add image
                          </label>
                        )}
                      </div>

                      <div className="row">
                        <button
                          onClick={() => saveEdit(t)}
                          className="btn primary small icon-btn"
                          disabled={savingEdit}
                        >
                          {savingEdit ? (
                            <>
                              <span className="btn-spinner" aria-hidden="true" />
                              Saving…
                            </>
                          ) : (
                            <>
                              <Check size={14} /> Save
                            </>
                          )}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="btn ghost small icon-btn"
                          disabled={savingEdit}
                        >
                          <X size={14} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        className="todo-check"
                        checked={t.completed}
                        onClick={(e) => handleCheckboxClick(t, e)}
                        onChange={() => {}}
                        aria-label={t.completed ? 'Mark as not done' : 'Mark as done'}
                      />
                      <div className="todo-content">
                        <div className="todo-title-line">
                          <span className="todo-title">{t.title}</span>
                          {t.completed && (
                            <span className="todo-badge done-badge">
                              <CheckCheck size={11} /> Done
                            </span>
                          )}
                        </div>
                        {t.note && <p className="todo-note">{t.note}</p>}
                        {t.imageUrl && (
                          <a
                            href={t.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="todo-image-wrap"
                            title="Open full size"
                          >
                            <img src={t.imageUrl} alt="" className="todo-image" />
                          </a>
                        )}
                        <div className="todo-meta">
                          <Clock size={11} aria-hidden="true" />
                          <time dateTime={new Date(t.createdAt).toISOString()}>
                            {new Date(t.createdAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </time>
                        </div>
                      </div>
                      <div className="todo-actions">
                        <button
                          onClick={() => startEdit(t)}
                          className="icon-only-btn"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(t)}
                          className="icon-only-btn danger"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={!!confirmTarget}
        title="Mark as complete?"
        message={
          confirmTarget
            ? `"${confirmTarget.title}" will be checked off your list.`
            : ''
        }
        confirmLabel="Yes, complete"
        cancelLabel="Cancel"
        busy={confirmBusy}
        onConfirm={handleConfirmComplete}
        onCancel={() => setConfirmTarget(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteTarget}
        title="Delete this to-do?"
        message={
          confirmDeleteTarget
            ? `"${confirmDeleteTarget.title}" will be permanently removed${
                confirmDeleteTarget.imageUrl ? ' along with its image' : ''
              }. This can't be undone.`
            : ''
        }
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        destructive
        busy={confirmDeleteBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteTarget(null)}
      />
    </>
  );
}

function PinnedWord({ word, loading }) {
  return (
    <section className="pinned" aria-live="polite">
      <div className="pin-icon" aria-hidden="true">
        <Pin size={14} />
      </div>
      <div className="pin-body">
        <div className="pin-label">Admin's word of the day</div>
        {loading ? (
          <>
            <SkeletonLine width="65%" height="16px" />
            <SkeletonLine width="40%" height="11px" className="mt-6" />
          </>
        ) : word ? (
          <>
            <p className="pin-text">{word.message}</p>
            <small className="muted">
              Posted by {word.updatedBy} · {new Date(word.updatedAt).toLocaleString()}
            </small>
          </>
        ) : (
          <p className="pin-text muted">No message from admin yet.</p>
        )}
      </div>
    </section>
  );
}

function EmptyState({ filter, hasQuery, totalCount }) {
  let message;
  if (hasQuery) message = 'No to-dos match your search.';
  else if (totalCount === 0) message = 'No to-dos yet — add your first one above.';
  else if (filter === 'active') message = 'Nothing active. Nice work!';
  else if (filter === 'completed') message = 'Nothing completed yet.';
  else message = 'No to-dos yet — add your first one above.';

  return (
    <div className="empty-state">
      <Inbox size={36} aria-hidden="true" />
      <p className="muted">{message}</p>
    </div>
  );
}
