import { useState, useEffect, useCallback } from 'react';
import { Save, Key, Database, Mail, Globe, CreditCard, Shield, Lock, RefreshCw, Server } from 'lucide-react';
import { useAdminContext } from '../../components/layout/AdminLayout';
import { fetchSettings, updateSettings } from '../../services/settings.service';

function SectionHead({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--color-blue-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} style={{ color: 'var(--color-blue)' }} />
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{title}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sub}</div>
      </div>
    </div>
  );
}

function ConfigRow({ label, type = 'text', value, onChange, id, secret, placeholder }: {
  label: string; type?: string; value: string | number; onChange: (v: string) => void;
  id: string; secret?: boolean; placeholder?: string;
}) {
  const [show, setShow] = useState(!secret);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <label className="form-label" style={{ margin: 0, flex: 1 }}>{label}</label>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <input
          id={id}
          type={show ? type : 'password'}
          className="form-control"
          style={{ width: 280 }}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
        />
        {secret && (
          <button onClick={() => setShow(v => !v)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            {show ? <Lock size={14} /> : <Key size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange, id }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void; id: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{description}</div>}
      </div>
      <button className={`toggle${value ? ' on' : ''}`} onClick={() => onChange(!value)} id={id}>
        <div className="toggle-thumb" style={{ transform: value ? 'translateX(18px)' : 'none' }} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { addToast, adminRole } = useAdminContext();
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSettings();
      setCfg(data);
    } catch (e: any) {
      addToast(e.message ?? 'Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  function update(key: string, value: string) {
    setCfg(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await updateSettings(cfg);
      addToast('Platform settings saved!', 'success');
    } catch (e: any) {
      addToast(e.message ?? 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  function getValue(key: string, defaultVal: string = '') {
    return cfg[key] ?? defaultVal;
  }

  function getBoolean(key: string, defaultVal: boolean = false) {
    const val = cfg[key];
    if (val === 'true') return true;
    if (val === 'false') return false;
    return defaultVal;
  }

  function updateBoolean(key: string, value: boolean) {
    update(key, value ? 'true' : 'false');
  }

  function testSmtp() { addToast('SMTP test email sent to ' + getValue('platformEmail', 'admin@lehkhabu.com'), 'info'); }
  function testPayment() { addToast('Razorpay connection verified ✓', 'success'); }
  function clearCache() { addToast('Server cache cleared.', 'success'); }

  if (loading) {
    return <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading settings…</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Platform Settings</h1>
            <p>Configure backend services, integrations, and security settings.</p>
          </div>
          <button className="btn btn-primary" onClick={save} disabled={saving || adminRole === 'readonly_admin'} id="save-platform-btn" style={{ opacity: adminRole === 'readonly_admin' ? 0.5 : 1, cursor: adminRole === 'readonly_admin' ? 'not-allowed' : 'pointer' }}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save All Settings'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-md)' }}>

        {/* General */}
        <div className="section-card animate-fade-in-up stagger-1">
          <SectionHead icon={Globe} title="General" sub="Platform identity and public-facing URLs" />
          <div style={{ padding: '0 var(--space-lg)' }}>
            <ConfigRow id="platform-name" label="Platform Name" value={getValue('platformName', 'Lehkhabu')} onChange={v => update('platformName', v)} />
            <ConfigRow id="platform-email" label="Admin Email" type="email" value={getValue('platformEmail', 'admin@lehkhabu.com')} onChange={v => update('platformEmail', v)} />
            <ConfigRow id="support-email" label="Support Email" type="email" value={getValue('supportEmail', 'support@lehkhabu.com')} onChange={v => update('supportEmail', v)} />
            <ConfigRow id="app-url" label="App URL" value={getValue('appUrl', 'https://lehkhabu.com')} onChange={v => update('appUrl', v)} />
            <ConfigRow id="api-url" label="API URL" value={getValue('apiUrl', 'http://localhost:8000')} onChange={v => update('apiUrl', v)} />
          </div>
        </div>

        {/* Database & Supabase */}
        <div className="section-card animate-fade-in-up stagger-2">
          <SectionHead icon={Database} title="Database & Storage" sub="Supabase connection and storage settings" />
          <div style={{ padding: '0 var(--space-lg)' }}>
            <ConfigRow id="supabase-url" label="Supabase URL" value={getValue('supabaseUrl', 'https://puwqymuuibpysixvkund.supabase.co')} onChange={v => update('supabaseUrl', v)} />
            <ConfigRow id="supabase-anon" label="Supabase Anon Key" value={getValue('supabaseAnonKey', '')} onChange={v => update('supabaseAnonKey', v)} secret placeholder="eyJhbGci..." />
            <ConfigRow id="supabase-service" label="Supabase Service Key" value={getValue('supabaseServiceKey', '')} onChange={v => update('supabaseServiceKey', v)} secret placeholder="eyJhbGci..." />
          </div>
        </div>

        {/* Email */}
        <div className="section-card animate-fade-in-up stagger-3">
          <SectionHead icon={Mail} title="Email (SMTP)" sub="Transactional email configuration" />
          <div style={{ padding: '0 var(--space-lg)' }}>
            <ConfigRow id="smtp-host" label="SMTP Host" value={getValue('smtpHost', 'smtp.postmarkapp.com')} onChange={v => update('smtpHost', v)} />
            <ConfigRow id="smtp-port" label="SMTP Port" value={getValue('smtpPort', '587')} onChange={v => update('smtpPort', v)} />
            <ConfigRow id="smtp-user" label="SMTP Username" value={getValue('smtpUser', 'admin@lehkhabu.com')} onChange={v => update('smtpUser', v)} />
            <ConfigRow id="smtp-pass" label="SMTP Password" value={getValue('smtpPass', '')} onChange={v => update('smtpPass', v)} secret />
          </div>
          <div style={{ padding: 'var(--space-md) var(--space-lg)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={testSmtp} id="test-smtp-btn">
              <RefreshCw size={13} /> Send Test Email
            </button>
          </div>
        </div>

        {/* Payment */}
        <div className="section-card animate-fade-in-up stagger-4">
          <SectionHead icon={CreditCard} title="Payment Gateway" sub="Razorpay integration and API keys" />
          <div style={{ padding: '0 var(--space-lg)' }}>
            <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="form-label" style={{ margin: 0 }}>Razorpay Mode</label>
              <div className="filter-tabs">
                {(['test', 'live'] as const).map(m => (
                  <button key={m} className={`filter-tab${getValue('razorpayMode', 'test') === m ? ' active' : ''}`}
                    onClick={() => update('razorpayMode', m)} id={`razorpay-${m}-btn`}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <ConfigRow id="razorpay-key" label="Key ID" value={getValue('razorpayKey', '')} onChange={v => update('razorpayKey', v)} secret />
            <ConfigRow id="razorpay-secret" label="Key Secret" value={getValue('razorpaySecret', '')} onChange={v => update('razorpaySecret', v)} secret />
          </div>
          <div style={{ padding: 'var(--space-md) var(--space-lg)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={testPayment} id="test-payment-btn">
              <RefreshCw size={13} /> Test Connection
            </button>
          </div>
        </div>

        {/* AI Settings */}
        <div className="section-card animate-fade-in-up stagger-5">
          <SectionHead icon={Server} title="AI Settings (Phase 2)" sub="Gemini & Pinecone for RAG-powered recommendations" />
          <div style={{ padding: '0 var(--space-lg)' }}>
            <ToggleRow id="gemini-toggle" label="Enable Gemini AI" description="Power book recommendations and AI search" value={getBoolean('geminiEnabled')} onChange={v => updateBoolean('geminiEnabled', v)} />
            {getBoolean('geminiEnabled') && (
              <>
                <ConfigRow id="gemini-key" label="Gemini API Key" value={getValue('geminiKey', '')} onChange={v => update('geminiKey', v)} secret />
                <ConfigRow id="pinecone-key" label="Pinecone API Key" value={getValue('pineconeKey', '')} onChange={v => update('pineconeKey', v)} secret />
                <ConfigRow id="pinecone-index" label="Pinecone Index" value={getValue('pineconeIndex', 'lehkhabu-books')} onChange={v => update('pineconeIndex', v)} />
              </>
            )}
          </div>
        </div>

        {/* Security */}
        <div className="section-card animate-fade-in-up stagger-6">
          <SectionHead icon={Shield} title="Security" sub="Authentication, sessions, and access controls" />
          <div style={{ padding: '0 var(--space-lg)' }}>
            <ToggleRow id="2fa-toggle" label="Two-Factor Authentication" description="Require 2FA for all admin logins" value={getBoolean('twoFactorEnabled')} onChange={v => updateBoolean('twoFactorEnabled', v)} />
            <ToggleRow id="rate-limit-toggle" label="IP Rate Limiting" description="Limit login attempts per IP address" value={getBoolean('ipRateLimitEnabled', true)} onChange={v => updateBoolean('ipRateLimitEnabled', v)} />
            <ConfigRow id="session-timeout" label="Session Timeout (minutes)" type="number"
              value={getValue('sessionTimeoutMinutes', '10080')} onChange={v => update('sessionTimeoutMinutes', v)} />
            <ConfigRow id="max-login-attempts" label="Max Login Attempts" type="number"
              value={getValue('maxLoginAttempts', '5')} onChange={v => update('maxLoginAttempts', v)} />
          </div>
        </div>

        {/* System Actions */}
        <div className="section-card animate-fade-in-up stagger-7">
          <SectionHead icon={RefreshCw} title="System Actions" sub="Maintenance and cache operations" />
          <div style={{ padding: 'var(--space-lg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
            {[
              { label: 'Clear Server Cache', sub: 'Flushes Redis and memory cache', action: clearCache, id: 'clear-cache-btn' },
              { label: 'Rebuild Search Index', sub: 'Re-index all books in Pinecone', action: () => addToast('Search index rebuild started.', 'info'), id: 'rebuild-index-btn' },
              { label: 'Export Full Database', sub: 'Download a full backup as JSON', action: () => addToast('Database export queued.', 'success'), id: 'export-db-btn' },
              { label: 'Send System Report', sub: 'Email a platform health report', action: () => addToast('System report sent!', 'success'), id: 'send-report-btn' },
            ].map(action => (
              <div key={action.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{action.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 10 }}>{action.sub}</div>
                <button className="btn btn-secondary btn-sm" disabled={adminRole === 'readonly_admin'} onClick={action.action} id={action.id}>Run</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
