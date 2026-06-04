import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import './Settings.css';

export default function AccountSettingsPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  if (!profile) return null;

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1>Account Settings</h1>
        <div style={{width: 32}}></div>
      </div>

      <div className="settings-content">
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-label">Email</div>
            <div className="settings-value">{profile.email}</div>
          </div>
          <div className="settings-row">
            <div className="settings-label">Username</div>
            <div className="settings-value">@{profile.username}</div>
          </div>
          <div className="settings-row">
            <div className="settings-label">Member Since</div>
            <div className="settings-value">{memberSince}</div>
          </div>
          <div className="settings-row">
            <div className="settings-label">Email Status</div>
            <div className="settings-value">
              <span className={`status-badge ${profile.is_email_verified ? 'verified' : 'unverified'}`}>
                {profile.is_email_verified ? '✓ Verified' : 'Not verified'}
              </span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-label">Account Role</div>
            <div className="settings-value role-badge">{profile.role}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
