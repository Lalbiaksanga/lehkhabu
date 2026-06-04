import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useState, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { uploadAvatar, uploadProfileBackground, updateUserProfile } from '../../services/profile.service';
import './Settings.css';

const createImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('No 2d context');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas is empty'));
        return;
      }
      resolve(new File([blob], 'image.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  });
}

type CropMode = 'avatar' | 'cover' | null;

export default function ProfileSettingsPage() {
  const navigate = useNavigate();
  const { profile, loadProfile } = useAuthStore();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Upload and Cropper state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const [cropMode, setCropMode] = useState<CropMode>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Form State
  const [editName, setEditName] = useState(profile?.full_name || '');
  const [editBio, setEditBio] = useState(profile?.bio || '');
  const [socialTwitter, setSocialTwitter] = useState(profile?.social_links?.twitter || '');
  const [socialInstagram, setSocialInstagram] = useState(profile?.social_links?.instagram || '');
  const [socialWebsite, setSocialWebsite] = useState(profile?.social_links?.website || '');
  const [isPublicLibrary, setIsPublicLibrary] = useState(profile?.is_public_library ?? true);
  
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);



  const handleMediaClick = (mode: 'avatar' | 'cover') => {
    if (!uploading && !imageSrc) {
      setCropMode(mode);
      fileInputRef.current?.click();
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => setImageSrc(reader.result?.toString() || null));
      reader.readAsDataURL(file);
    } else {
      setCropMode(null);
    }
  };

  const onCropComplete = useCallback((_croppedArea: { x: number; y: number; width: number; height: number }, croppedAreaPixels: { x: number; y: number; width: number; height: number }) => {
    setCroppedAreaPixels(croppedAreaPixels as any);
  }, []);

  const handleUploadCroppedImage = async () => {
    if (!profile || !imageSrc || !croppedAreaPixels || !cropMode) return;
    setUploading(true);
    setUploadError(null);
    try {
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels);
      
      if (cropMode === 'avatar') {
        const url = await uploadAvatar(profile.id, croppedFile);
        await updateUserProfile(profile.id, { avatar_url: url });
      } else if (cropMode === 'cover') {
        const url = await uploadProfileBackground(profile.id, croppedFile);
        await updateUserProfile(profile.id, { profile_bg_url: url });
      }

      if (profile.supabase_uid) await loadProfile(profile.supabase_uid);
      setImageSrc(null);
      setCropMode(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Cropping upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const cancelCrop = () => {
    setImageSrc(null);
    setCropMode(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveEdit = async () => {
    if (!profile) return;
    if (!editName.trim()) {
      setSaveError('Name cannot be empty.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    
    // Build social links
    const socialLinks: Record<string, string> = {};
    if (socialTwitter) socialLinks.twitter = socialTwitter.trim();
    if (socialInstagram) socialLinks.instagram = socialInstagram.trim();
    if (socialWebsite) socialLinks.website = socialWebsite.trim();

    try {
      await updateUserProfile(profile.id, {
        full_name: editName.trim(),
        bio: editBio.trim() || undefined,
        social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
        is_public_library: isPublicLibrary
      });
      if (profile.supabase_uid) await loadProfile(profile.supabase_uid);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="20" height="20">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1>Profile Settings</h1>
        <div style={{width: 32}}></div>
      </div>

      <div className="settings-content">
        
        {/* Media Cropper Box or Preview Fields */}
        <div className="settings-visual-section">
          {imageSrc ? (
            <div className="cropper-container" style={{ position: 'relative', width: '100%', height: 350, background: '#333', borderRadius: '16px', overflow: 'hidden' }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={cropMode === 'cover' ? 3 / 1 : 1}
                cropShape={cropMode === 'avatar' ? "round" : "rect"}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
              <div className="cropper-controls" style={{ position: 'absolute', bottom: 16, left: 16, right: 16, display: 'flex', gap: '8px' }}>
                <button className="cropper-btn cancel" onClick={cancelCrop}>Cancel</button>
                <button className="cropper-btn save" onClick={handleUploadCroppedImage} disabled={uploading}>
                  {uploading ? 'Processing...' : `Save ${cropMode === 'avatar' ? 'Picture' : 'Cover'}`}
                </button>
              </div>
            </div>
          ) : (
            <div className="visual-previews">
              
              {/* Cover Preview */}
              <div 
                className="cover-preview-box" 
                onClick={() => handleMediaClick('cover')}
                style={{
                  backgroundImage: profile.profile_bg_url ? `url(${profile.profile_bg_url})` : 'linear-gradient(135deg, rgba(253, 246, 236, 1) 0%, rgba(245, 235, 224, 1) 100%)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat'
                }}
              >
                <div className="cover-edit-overlay">
                  {uploading && cropMode === 'cover' ? <div className="auth-init-spinner" /> : <span>Update Cover Image</span>}
                </div>
              </div>

              {/* Avatar Preview */}
              <div className="settings-avatar-wrap overlay-avatar" onClick={() => handleMediaClick('avatar')}>
                {uploading && cropMode === 'avatar' ? (
                  <div className="avatar-loading">
                    <div className="auth-init-spinner" style={{ width: 24, height: 24 }} />
                  </div>
                ) : profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="settings-avatar-img" />
                ) : (
                  <div className="settings-avatar-placeholder">
                    {profile.full_name?.[0]?.toUpperCase() || profile.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                {!uploading && (
                  <div className="settings-avatar-badge">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="settings-avatar-hint" style={{ marginTop: '54px', textAlign: 'center' }}>Tap elements to update</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onFileChange}
          />
          {uploadError && <div className="settings-error">{uploadError}</div>}
        </div>

        <div className="settings-form">
          <div className="form-section-title">Personal Details</div>
          <div className="form-group">
            <label>Display Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Your full name"
              maxLength={80}
            />
          </div>

          <div className="form-group">
            <label>Bio <span className="optional-badge">Optional</span></label>
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="Tell us about yourself"
              rows={4}
              maxLength={300}
            />
          </div>

          <div className="form-section-title" style={{ marginTop: '24px' }}>Social Links <span className="optional-badge">Optional</span></div>
          <div className="form-group">
            <label>X (Twitter) Handle</label>
            <input
              type="text"
              value={socialTwitter}
              onChange={(e) => setSocialTwitter(e.target.value)}
              placeholder="@username"
            />
          </div>
          <div className="form-group">
            <label>Instagram Handle</label>
            <input
              type="text"
              value={socialInstagram}
              onChange={(e) => setSocialInstagram(e.target.value)}
              placeholder="@username"
            />
          </div>
          <div className="form-group">
            <label>Personal Website</label>
            <input
              type="url"
              value={socialWebsite}
              onChange={(e) => setSocialWebsite(e.target.value)}
              placeholder="https://yourwebsite.com"
            />
          </div>

          <div className="form-section-title" style={{ marginTop: '24px' }}>Privacy</div>
          <div className="form-toggle-group" onClick={() => setIsPublicLibrary(!isPublicLibrary)}>
            <div className="toggle-info">
              <label>Public Library</label>
              <p>Let others see what books you have read, currently reading, and plan to read.</p>
            </div>
            <div className={`toggle-switch ${isPublicLibrary ? 'active' : ''}`}>
              <div className="toggle-knob"></div>
            </div>
          </div>

          {saveError && <div className="settings-error" style={{ marginTop: '16px' }}>{saveError}</div>}
          {saveSuccess && <div className="settings-success" style={{ marginTop: '16px' }}>Profile updated successfully!</div>}

          <button 
            className="settings-save-btn" 
            onClick={saveEdit} 
            disabled={saving}
            style={{ marginTop: '24px' }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
