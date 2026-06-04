import { useState, useEffect, useCallback } from 'react';
import { Plus, Megaphone, XCircle, Edit2, Trash2, Eye, EyeOff, RefreshCw, AlertCircle } from 'lucide-react';
import {
  fetchAnnouncements, createAnnouncement, updateAnnouncement,
  toggleAnnouncementActive, deleteAnnouncement, type AdminAnnouncement,
} from '../../services/announcements.service';
import { useAdminContext } from '../../components/layout/AdminLayout';
import { format } from 'date-fns';

const emptyForm = { title: '', content: '', isActive: true };

export default function AnnouncementsPage() {
  const { addToast, adminRole } = useAdminContext();
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnnouncements();
      setAnnouncements(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(ann: AdminAnnouncement) {
    setEditId(ann.id);
    setForm({ title: ann.title, content: ann.content, isActive: ann.isActive });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      addToast('Title and content are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateAnnouncement(editId, { title: form.title, content: form.content, isActive: form.isActive });
        addToast('Announcement updated!', 'success');
      } else {
        await createAnnouncement(form.title, form.content, form.isActive);
        addToast('Announcement created!', 'success');
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      addToast(e.message ?? 'Failed to save announcement.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(ann: AdminAnnouncement) {
    setMutatingId(ann.id);
    try {
      await toggleAnnouncementActive(ann.id, !ann.isActive);
      addToast(ann.isActive ? 'Announcement hidden.' : 'Announcement published!', 'success');
      await load();
    } catch {
      addToast('Failed to update announcement.', 'error');
    } finally {
      setMutatingId(null);
    }
  }

  async function handleDelete(ann: AdminAnnouncement) {
    if (!confirm(`Delete "${ann.title}"? This cannot be undone.`)) return;
    setMutatingId(ann.id);
    try {
      await deleteAnnouncement(ann.id);
      addToast('Announcement deleted.', 'error');
      await load();
    } catch {
      addToast('Failed to delete announcement.', 'error');
    } finally {
      setMutatingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Announcements</h1>
            <p>Create and manage platform-wide announcements shown to users.</p>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-secondary btn-sm" onClick={load} id="refresh-announcements-btn">
              <RefreshCw size={14} /> Refresh
            </button>
            {adminRole !== 'readonly_admin' && (
              <button className="btn btn-primary" onClick={openCreate} id="create-announcement-btn">
                <Plus size={16} /> New Announcement
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="announcement-banner" style={{ marginBottom: 'var(--space-md)', borderColor: 'var(--color-red)', background: 'rgba(239,68,68,0.06)' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-red)' }}>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        {[
          { label: 'Total', value: loading ? '…' : announcements.length, color: 'var(--text-primary)' },
          { label: 'Active', value: loading ? '…' : announcements.filter(a => a.isActive).length, color: 'var(--color-green)' },
          { label: 'Inactive', value: loading ? '…' : announcements.filter(a => !a.isActive).length, color: 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: s.color, fontFamily: 'var(--font-heading)' }}>{s.value}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
        {loading && (
          <div className="section-card">
            <div className="section-card-body" style={{ textAlign: 'center', padding: 'var(--space-2xl)', color: 'var(--text-muted)' }}>
              Loading announcements…
            </div>
          </div>
        )}
        {!loading && announcements.length === 0 && (
          <div className="empty-state section-card">
            <Megaphone size={40} />
            <p>No announcements yet. Create one!</p>
          </div>
        )}
        {announcements.map((ann, i) => (
          <div key={ann.id}
            className={`section-card animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}
            style={{ opacity: (ann.isActive ? 1 : 0.6) * (mutatingId === ann.id ? 0.5 : 1), transition: 'opacity var(--dur-normal)' }}>
            <div className="section-card-body">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-md)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: ann.isActive ? 'var(--color-gold-dim)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Megaphone size={18} style={{ color: ann.isActive ? 'var(--color-gold)' : 'var(--text-muted)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{ann.title}</h3>
                      <span className={`badge badge-${ann.isActive ? 'approved' : 'pending'}`}>
                        {ann.isActive ? 'Published' : 'Hidden'}
                      </span>
                      {ann.createdByName && (
                        <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                          by {ann.createdByName}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>{ann.content}</p>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Created {format(new Date(ann.createdAt), 'MMM d, yyyy · h:mm a')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {adminRole !== 'readonly_admin' && (
                    <>
                      <button className="btn-icon" title={ann.isActive ? 'Hide' : 'Publish'}
                        disabled={mutatingId === ann.id}
                        onClick={() => handleToggle(ann)} id={`toggle-ann-${ann.id}`}
                        style={{ color: ann.isActive ? 'var(--color-gold)' : 'var(--text-muted)' }}>
                        {ann.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(ann)} id={`edit-ann-${ann.id}`}>
                        <Edit2 size={14} />
                      </button>
                      <button className="btn-icon" title="Delete"
                        disabled={mutatingId === ann.id}
                        style={{ background: 'var(--color-red-dim)', color: 'var(--color-red)', border: 'none' }}
                        onClick={() => handleDelete(ann)} id={`delete-ann-${ann.id}`}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{editId ? 'Edit Announcement' : 'New Announcement'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)} id="close-ann-modal"><XCircle size={16} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-control" placeholder="Announcement title…"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} id="ann-title-input" />
            </div>
            <div className="form-group">
              <label className="form-label">Content *</label>
              <textarea className="form-control" placeholder="Write the announcement content…" rows={4}
                value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                id="ann-content-input" style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 0 }}>
              <label className="form-label" style={{ margin: 0 }}>Publish immediately</label>
              <button className={`toggle${form.isActive ? ' on' : ''}`}
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} id="ann-active-toggle">
                <div className="toggle-thumb" style={{ transform: form.isActive ? 'translateX(18px)' : 'none' }} />
              </button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} id="save-announcement-btn">
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
