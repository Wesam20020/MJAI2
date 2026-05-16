import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus, User, Mail, LockKeyhole, Sparkles } from 'lucide-react';
import { registerUser } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    try {
      const response = await registerUser(formData);
      if (!response?.data?.user || !response?.data?.token) {
        throw new Error(response?.message || 'Registration succeeded but user or token is missing');
      }
      login(response.data.user, response.data.token);
      showToast(t('auth.register_success'), 'success');
      navigate('/');
    } catch (err) {
      const message = err.message || t('errors.load_failed');
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page-v2">
      <div className="auth-card-v2 anim-scale-in">
        <div className="auth-brand-mark">
          <div className="brand-icon" style={{ background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Sparkles size={24} />
          </div>
          <h1>{t('auth.register_title')}</h1>
          <p>{t('auth.register_subtitle')}</p>
        </div>

        <form className="form-v2" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="name">{t('auth.name_label')}</label>
            <div className="form-input-shell">
              <User size={16} style={{ color: 'var(--muted)', marginLeft: 14, flexShrink: 0 }} />
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder={t('auth.name_placeholder')}
                autoComplete="name"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="register-email">{t('auth.email_label')}</label>
            <div className="form-input-shell">
              <Mail size={16} style={{ color: 'var(--muted)', marginLeft: 14, flexShrink: 0 }} />
              <input
                id="register-email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder={t('auth.email_placeholder')}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="register-password">{t('auth.password_label')}</label>
            <div className="form-input-shell">
              <LockKeyhole size={16} style={{ color: 'var(--muted)', marginLeft: 14, flexShrink: 0 }} />
              <input
                id="register-password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder={t('auth.password_create_placeholder')}
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary full-width btn-glow" disabled={isSubmitting} style={{ marginTop: 6 }}>
            <UserPlus size={17} />
            {isSubmitting ? t('auth.registering') : t('auth.register_btn')}
          </button>
        </form>

        <p className="auth-footer-v2">
          {t('auth.have_account')}{' '}
          <Link to="/login">{t('auth.log_in_link')}</Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
