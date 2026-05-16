import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchProfile, uploadProfileImage, deleteProfileImage } from '../api/apiClient';
import { User, Mail, Calendar, BarChart3, Edit3, Award, Upload, Trash2 } from 'lucide-react';

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
      <Icon size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
      <span style={{ color: 'var(--muted)', fontSize: '0.85rem', minWidth: 140 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{value || '—'}</span>
    </div>
  );
}

function ProfilePage() {
  const { t } = useTranslation();
  const { user, login, token } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchProfile()
      .then(res => {
        setProfile(res.data);
        // Sync profile image to localStorage user
        if (res.data?.user?.profileImage && user) {
          const updated = { ...user, profileImage: res.data.user.profileImage };
          login(updated, token);
        }
      })
      .catch(err => setError(err.message || t('errors.load_failed')))
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line

  const formatDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(t('profile.image_format_error') || 'Only JPG, PNG, and WebP images are allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t('profile.image_size_error') || 'Image must be under 2MB');
      return;
    }

    setAvatarUploading(true);
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await uploadProfileImage(reader.result);
        setProfile(prev => ({
          ...prev,
          user: { ...prev.user, profileImage: res.data.profileImage }
        }));
        // Sync to auth context
        const updated = { ...user, profileImage: res.data.profileImage };
        login(updated, token);
      } catch (err) {
        setError(err.message || 'Upload failed');
      } finally {
        setAvatarUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = async () => {
    setAvatarUploading(true);
    setError('');
    try {
      await deleteProfileImage();
      setProfile(prev => ({
        ...prev,
        user: { ...prev.user, profileImage: '' }
      }));
      const updated = { ...user, profileImage: '' };
      login(updated, token);
    } catch (err) {
      setError(err.message || 'Failed to remove image');
    } finally {
      setAvatarUploading(false);
    }
  };

  const profileImage = profile?.user?.profileImage || '';
  const initials = (profile?.user?.fullName || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>{t('profile.title')}</h1>
          {profile && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{profile.user.email}</p>}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/profile/edit')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', padding: '8px 16px' }}
        >
          <Edit3 size={14} />
          {t('profile.edit_btn')}
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)', padding: '20px 0' }}>
          <div className="loading-spinner" />
          <span>{t('profile.loading')}</span>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {!isLoading && !error && profile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Avatar section */}
          <div className="glass-card anim-fade-up" style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div className="profile-avatar-section">
              {profileImage ? (
                <img src={profileImage} alt={profile.user.fullName} className="profile-avatar-large" />
              ) : (
                <div className="profile-avatar-initials-large">{initials}</div>
              )}

              <div className="profile-avatar-actions">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                />
                <button
                  className="profile-avatar-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  <Upload size={13} /> {avatarUploading ? '...' : t('profile.upload_photo')}
                </button>
                {profileImage && (
                  <button
                    className="profile-avatar-remove-btn"
                    onClick={handleRemoveImage}
                    disabled={avatarUploading}
                  >
                    <Trash2 size={13} /> {t('profile.remove_photo')}
                  </button>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 800, fontSize: '1.15rem' }}>{profile.user.fullName}</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{user?.isAdmin ? t('admin.role_admin') : t('admin.role_user')}</p>
            </div>
          </div>

          {/* Account info */}
          <div className="glass-card anim-fade-up delay-100" style={{ padding: '24px 28px' }}>
            <InfoRow icon={Mail} label={t('profile.email_label')} value={profile.user.email} />
            <InfoRow icon={Calendar} label={t('profile.joined')} value={formatDate(profile.user.createdAt)} />
            <InfoRow icon={BarChart3} label={t('profile.attempts')} value={profile.recommendationSummary.attemptsCount} />
            <InfoRow icon={Award} label={t('profile.latest_major')} value={profile.recommendationSummary.latestRecommendedMajor} />
          </div>

          {profile.recommendationSummary.topThreeMajors?.length > 0 && (
            <div className="glass-card anim-fade-up delay-200" style={{ padding: '24px 28px' }}>
              <p style={{ fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart3 size={15} style={{ color: 'var(--primary)' }} />
                {t('profile.top3')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profile.recommendationSummary.topThreeMajors.map((item, i) => (
                  <div key={item.major} className="result-ranked-item">
                    <span className="result-rank-badge">{i + 1}</span>
                    <span className="result-ranked-name">{item.major}</span>
                    {item.score && <span className="result-ranked-score">{item.score}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(profile.profile.educationLevel || profile.profile.schoolOrUniversity || profile.profile.gpa) && (
            <div className="glass-card anim-fade-up delay-300" style={{ padding: '24px 28px' }}>
              <p style={{ fontWeight: 700, marginBottom: 14 }}>{t('profile.academic_info')}</p>
              {profile.profile.educationLevel && <InfoRow icon={Award} label={t('profile.education_level')} value={profile.profile.educationLevel} />}
              {profile.profile.schoolOrUniversity && <InfoRow icon={Award} label={t('profile.school')} value={profile.profile.schoolOrUniversity} />}
              {profile.profile.gpa && <InfoRow icon={Award} label={t('profile.gpa')} value={profile.profile.gpa} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
