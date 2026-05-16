import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fetchProfile, updateProfile } from '../api/apiClient';

// Field is defined OUTSIDE the component to prevent re-creation on every render
// which was causing focus loss after each keystroke
function Field({ label, name, value, onChange, placeholder, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}>{label}</label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="admin-inline-input"
        style={{ width: '100%' }}
      />
      {hint && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function EditProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    name: '',
    educationLevel: '',
    schoolOrUniversity: '',
    gpa: '',
    preferredStudyStyle: '',
    preferredStudyDestination: '',
    favoriteSubjects: '',
    weakSubjects: '',
    academicInterests: '',
    careerInterests: ''
  });

  useEffect(() => {
    fetchProfile()
      .then(res => {
        const { user, profile } = res.data;
        setForm({
          name: user.fullName || '',
          educationLevel: profile.educationLevel || '',
          schoolOrUniversity: profile.schoolOrUniversity || '',
          gpa: profile.gpa || '',
          preferredStudyStyle: profile.preferredStudyStyle || '',
          preferredStudyDestination: profile.preferredStudyDestination || '',
          favoriteSubjects: profile.favoriteSubjects?.join(', ') || '',
          weakSubjects: profile.weakSubjects?.join(', ') || '',
          academicInterests: profile.academicInterests?.join(', ') || '',
          careerInterests: profile.careerInterests?.join(', ') || ''
        });
      })
      .catch(err => setError(err.message || t('errors.load_failed')))
      .finally(() => setIsLoading(false));
  }, [t]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateProfile({
        name: form.name,
        educationLevel: form.educationLevel,
        schoolOrUniversity: form.schoolOrUniversity,
        gpa: form.gpa,
        preferredStudyStyle: form.preferredStudyStyle,
        preferredStudyDestination: form.preferredStudyDestination,
        favoriteSubjects: form.favoriteSubjects.split(',').map(s => s.trim()).filter(Boolean),
        weakSubjects: form.weakSubjects.split(',').map(s => s.trim()).filter(Boolean),
        academicInterests: form.academicInterests.split(',').map(s => s.trim()).filter(Boolean),
        careerInterests: form.careerInterests.split(',').map(s => s.trim()).filter(Boolean)
      });
      setSuccess(t('profile.save_success'));
      setTimeout(() => navigate('/profile'), 1200);
    } catch (err) {
      setError(err.message || t('errors.submit_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>{t('profile.edit_btn')}</h1>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)' }}>
          <div className="loading-spinner" />
          <span>{t('profile.loading')}</span>
        </div>
      )}

      {!isLoading && (
        <form onSubmit={handleSubmit} className="glass-card anim-fade-up" style={{ padding: '28px 32px' }}>
          {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}
          {success && <p style={{ color: '#22c55e', marginBottom: 16, fontSize: '0.9rem', fontWeight: 600 }}>{success}</p>}

          <Field label={t('profile.name_label')} name="name" value={form.name} onChange={handleChange} placeholder={t('profile.name_placeholder')} />
          <Field label={t('profile.education_level')} name="educationLevel" value={form.educationLevel} onChange={handleChange} placeholder={t('profile.education_placeholder')} />
          <Field label={t('profile.school')} name="schoolOrUniversity" value={form.schoolOrUniversity} onChange={handleChange} placeholder={t('profile.school_placeholder')} />
          <Field label={t('profile.gpa')} name="gpa" value={form.gpa} onChange={handleChange} placeholder={t('profile.gpa_placeholder')} />
          <Field label={t('profile.study_style')} name="preferredStudyStyle" value={form.preferredStudyStyle} onChange={handleChange} placeholder={t('profile.study_style_placeholder')} />
          <Field label={t('profile.study_destination')} name="preferredStudyDestination" value={form.preferredStudyDestination} onChange={handleChange} placeholder={t('profile.destination_placeholder')} />
          <Field label={t('profile.favorite_subjects')} name="favoriteSubjects" value={form.favoriteSubjects} onChange={handleChange} placeholder={t('profile.subjects_placeholder')} hint={t('profile.comma_separated')} />
          <Field label={t('profile.weak_subjects')} name="weakSubjects" value={form.weakSubjects} onChange={handleChange} placeholder={t('profile.weak_subjects_placeholder')} hint={t('profile.comma_separated')} />
          <Field label={t('profile.academic_interests')} name="academicInterests" value={form.academicInterests} onChange={handleChange} placeholder={t('profile.academic_interests_placeholder')} hint={t('profile.comma_separated')} />
          <Field label={t('profile.career_interests')} name="careerInterests" value={form.careerInterests} onChange={handleChange} placeholder={t('profile.career_interests_placeholder')} hint={t('profile.comma_separated')} />

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ flex: 1 }}>
              {isSaving ? t('profile.saving') : t('profile.save_btn')}
            </button>
            <button type="button" onClick={() => navigate('/profile')} className="btn btn-secondary" style={{ flex: 1 }}>
              {t('profile.cancel_btn')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default EditProfilePage;
