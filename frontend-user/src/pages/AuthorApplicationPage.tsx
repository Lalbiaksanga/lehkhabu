import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  submitAuthorApplication,
  fetchMyApplication,
  uploadApplicationFile,
  subscribeToApplicationStatus,
  type AuthorApplication,
} from '../services/author.service';

const GENRES = [
  'Fiction', 'Non-Fiction', 'History', 'Religious', 'Poetry',
  'Novel', 'Short Stories', 'Spiritual', 'Travel', 'Biography', 'Academic', 'Children',
];
const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.epub';

type Step = 'form' | 'review' | 'done';

interface FormState {
  writingSample: string;
  motivation: string;
  genre: string;
  socialLinks: string;
}

const emptyForm = (): FormState => ({
  writingSample: '',
  motivation: '',
  genre: '',
  socialLinks: '',
});

export default function AuthorApplicationPage() {
  const navigate = useNavigate();
  const { profile, loadProfile, user } = useAuthStore();

  const [application, setApplication] = useState<AuthorApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = profile?.id;

  // Load existing application
  useEffect(() => {
    if (!userId) return;
    
    let isMounted = true;
    setLoading(true);
    
    fetchMyApplication(userId)
      .then((app) => { 
         if (isMounted) {
           setApplication(app); 
           setLoading(false); 
         }
      })
      .catch((err) => { 
         console.error('Failed to load application:', err);
         if (isMounted) setLoading(false); 
      });
      
    return () => { isMounted = false; };
  }, [userId]);

  // Real-time subscription for status changes
  useEffect(() => {
    if (!userId || !application) return;
    const channel = subscribeToApplicationStatus(userId, (status, adminNotes) => {
      setApplication((prev) => prev ? { ...prev, status, admin_notes: adminNotes } : prev);
      // Refresh user profile so role updates instantly
      if (user) loadProfile(user.id);
    });
    return () => { channel.unsubscribe(); };
  }, [userId, application?.id, user, loadProfile]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.writingSample.trim() || form.writingSample.trim().length < 50)
      e.writingSample = 'Writing sample must be at least 50 characters';
    if (!form.motivation.trim() || form.motivation.trim().length < 30)
      e.motivation = 'Motivation must be at least 30 characters';
    if (!form.genre) e.genre = 'Please select a genre';
    if (!selectedFile) e.file = 'Please upload at least one sample file (PDF, Word, or EPUB)';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!file) { setSelectedFile(null); return; }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setFileError('File must be smaller than 10 MB');
      setSelectedFile(null);
      return;
    }
    const allowed = ['application/pdf', 'application/epub+zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'];
    const nameOk = /\.(pdf|epub|docx|doc)$/i.test(file.name);
    if (!allowed.includes(file.type) && !nameOk) {
      setFileError('Only PDF, EPUB, DOC, or DOCX files are accepted');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }

  async function handleSubmit() {
    if (!validate() || !userId) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;

      if (selectedFile) {
        setFileUploading(true);
        const result = await uploadApplicationFile(userId, selectedFile);
        fileUrl = result.url;
        fileName = result.name;
        setFileUploading(false);
      }

      const app = await submitAuthorApplication({
        userId,
        writingSample: form.writingSample,
        motivation: form.motivation,
        genre: form.genre,
        socialLinks: form.socialLinks || undefined,
        sampleFileUrl: fileUrl,
        sampleFileName: fileName,
      });

      setApplication(app);
      setStep('done');
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
      setFileUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="page author-app-page">
        <div className="app-loading">
          <div className="app-loading-spinner" />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  // ── Status screens ──────────────────────────────────────────────

  if (profile?.role === 'AUTHOR' || application?.status === 'APPROVED') {
    return (
      <div className="page author-app-page">
        <div className="app-status-card app-status-approved">
          <div className="app-status-icon">✅</div>
          <h2>You're an Author!</h2>
          <p>Your application has been approved. Head to your Author Dashboard to publish books.</p>
          <button className="btn-author-primary" onClick={() => navigate('/author')}>
            Go to Author Dashboard →
          </button>
        </div>
      </div>
    );
  }

  if ((application?.status === 'PENDING') && step !== 'done') {
    return (
      <div className="page author-app-page">
        <div className="app-status-card app-status-pending">
          <div className="app-status-icon">⏳</div>
          <h2>Application Under Review</h2>
          <p>
            Submitted on{' '}
            {new Date(application.submitted_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
          <p className="app-status-sub">
            Our team will review your submission within 2–3 business days. You'll receive an in-app notification once a decision is made.
          </p>
          {application.sample_file_name && (
            <div className="app-file-chip">
              <span className="app-file-icon">📄</span>
              <span>{application.sample_file_name}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (application?.status === 'REJECTED') {
    return (
      <div className="page author-app-page">
        <div className="app-status-card app-status-rejected">
          <div className="app-status-icon">❌</div>
          <h2>Application Not Approved</h2>
          {application.admin_notes && (
            <div className="app-reject-note">
              <strong>Note from reviewer:</strong> {application.admin_notes}
            </div>
          )}
          <p className="app-status-sub">
            You may revise and resubmit your application with updated content.
          </p>
          <button
            className="btn-author-primary"
            onClick={() => { setApplication(null); setForm(emptyForm()); setSelectedFile(null); setStep('form'); }}
          >
            Reapply
          </button>
        </div>
      </div>
    );
  }

  // ── Submission success (just submitted) ─────────────────────────
  if (step === 'done' && application) {
    return (
      <div className="page author-app-page">
        <div className="app-status-card app-status-pending">
          <div className="app-status-icon">🎉</div>
          <h2>Application Submitted!</h2>
          <p>Thank you! Your application is now under review.</p>
          <p className="app-status-sub">
            We'll send you an in-app notification once a decision has been made (typically 2–3 business days).
          </p>
          {application.sample_file_name && (
            <div className="app-file-chip">
              <span className="app-file-icon">📄</span>
              <span>{application.sample_file_name}</span>
            </div>
          )}
          <button className="btn-author-primary" style={{ marginTop: '1.5rem' }} onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────
  return (
    <div className="page author-app-page">
      {/* Hero */}
      <div className="author-app-hero">
        <div className="author-app-hero-icon">✍️</div>
        <h1>Become an Author</h1>
        <p>Share your stories with the Lehkhabu community. Upload a sample file and tell us about your writing.</p>
      </div>

      {/* Steps indicator */}
      <div className="author-app-steps">
        {[
          { label: 'Your Writing', key: 'form' },
          { label: 'Sample File', key: 'form' },
          { label: 'Review & Submit', key: 'review' },
        ].map(({ label }, i) => (
          <div
            key={label}
            className={`author-app-step ${
              step === 'review' && i < 2 ? 'done' : step === 'review' && i === 2 ? 'active' : i === 0 ? 'active' : ''
            }`}
          >
            <div className="author-app-step-num">{step === 'review' && i < 2 ? '✓' : i + 1}</div>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {step === 'form' && (
        <div className="author-app-form">
          {/* Writing Sample */}
          <section className="app-form-section">
            <h2 className="app-form-section-title">📝 Writing Sample</h2>
            <div className="app-field">
              <label>
                Share a passage or excerpt from your work{' '}
                <span className="app-field-hint">({form.writingSample.length}/2000)</span>
              </label>
              <textarea
                id="app-writing-sample"
                className={`app-textarea ${errors.writingSample ? 'app-input-error' : ''}`}
                value={form.writingSample}
                onChange={(e) => setForm((f) => ({ ...f, writingSample: e.target.value.slice(0, 2000) }))}
                placeholder="Paste a sample from one of your works — a chapter, poem, or passage…"
                rows={6}
              />
              {errors.writingSample && <span className="app-field-error">{errors.writingSample}</span>}
            </div>

            <div className="app-field">
              <label>
                Why do you want to publish on Lehkhabu?{' '}
                <span className="app-field-hint">({form.motivation.length}/500)</span>
              </label>
              <textarea
                id="app-motivation"
                className={`app-textarea ${errors.motivation ? 'app-input-error' : ''}`}
                value={form.motivation}
                onChange={(e) => setForm((f) => ({ ...f, motivation: e.target.value.slice(0, 500) }))}
                placeholder="Tell us about your writing journey and why you want to publish on Lehkhabu…"
                rows={4}
              />
              {errors.motivation && <span className="app-field-error">{errors.motivation}</span>}
            </div>

            <div className="app-fields-row">
              <div className="app-field">
                <label>Primary Genre</label>
                <select
                  id="app-genre"
                  className={`app-select ${errors.genre ? 'app-input-error' : ''}`}
                  value={form.genre}
                  onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                >
                  <option value="">Select genre</option>
                  {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                {errors.genre && <span className="app-field-error">{errors.genre}</span>}
              </div>
              <div className="app-field">
                <label>Social / Portfolio Link <span className="app-field-hint">(optional)</span></label>
                <input
                  id="app-social"
                  className="app-input"
                  value={form.socialLinks}
                  onChange={(e) => setForm((f) => ({ ...f, socialLinks: e.target.value }))}
                  placeholder="https://your-website.com"
                  type="url"
                />
              </div>
            </div>
          </section>

          {/* Sample File Upload */}
          <section className="app-form-section">
            <h2 className="app-form-section-title">📎 Sample File</h2>
            <p className="app-section-desc">
              Upload at least one file (PDF, Word, or EPUB) that demonstrates your writing quality.
            </p>

            <div
              className={`app-file-drop-zone ${errors.file ? 'app-input-error' : ''} ${selectedFile ? 'has-file' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                  const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handleFileChange(fakeEvent);
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              {selectedFile ? (
                <div className="app-file-selected">
                  <div className="app-file-icon-large">📄</div>
                  <div className="app-file-info">
                    <div className="app-file-name">{selectedFile.name}</div>
                    <div className="app-file-size">{(selectedFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button
                    className="app-file-remove"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setErrors((p) => ({ ...p, file: '' })); }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="app-file-placeholder">
                  <div className="app-file-upload-icon">📁</div>
                  <p>Click or drag & drop a file here</p>
                  <p className="app-file-hint">PDF, Word, or EPUB • Max 10 MB</p>
                </div>
              )}
            </div>
            {fileError && <span className="app-field-error">{fileError}</span>}
            {errors.file && !selectedFile && <span className="app-field-error">{errors.file}</span>}
          </section>

          {submitError && (
            <div className="app-submit-error">⚠️ {submitError}</div>
          )}

          <button
            className="btn-author-primary"
            disabled={submitting}
            onClick={() => { if (validate()) setStep('review'); }}
          >
            Review Application →
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="author-app-form">
          <div className="app-review-header">
            <h2>Review Your Application</h2>
            <p>Make sure everything looks good before submitting.</p>
          </div>

          <div className="app-review-section">
            <div className="app-review-label">Writing Sample</div>
            <div className="app-review-bio">{form.writingSample.slice(0, 400)}{form.writingSample.length > 400 ? '…' : ''}</div>
          </div>

          <div className="app-review-section">
            <div className="app-review-label">Motivation</div>
            <div className="app-review-bio">{form.motivation}</div>
          </div>

          <div className="app-review-section">
            <div className="app-review-row"><span>Genre</span><strong>{form.genre}</strong></div>
            {form.socialLinks && <div className="app-review-row"><span>Portfolio</span><strong>{form.socialLinks}</strong></div>}
          </div>

          {selectedFile && (
            <div className="app-review-section">
              <div className="app-review-label">Attached File</div>
              <div className="app-file-chip">
                <span className="app-file-icon">📄</span>
                <span>{selectedFile.name}</span>
                <span className="app-file-size-chip">{(selectedFile.size / 1024).toFixed(0)} KB</span>
              </div>
            </div>
          )}

          {submitError && (
            <div className="app-submit-error">⚠️ {submitError}</div>
          )}

          <div className="app-review-actions">
            <button className="app-back-btn" onClick={() => setStep('form')} disabled={submitting}>
              ← Edit
            </button>
            <button
              className="btn-author-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? fileUploading ? 'Uploading file…' : 'Submitting…'
                : 'Submit Application ✓'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
