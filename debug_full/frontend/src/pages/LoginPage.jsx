import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Mail, LockKeyhole, Sparkles } from 'lucide-react';
import { loginUser } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({ email: '', password: '' });
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
      const response = await loginUser(formData);
      if (!response?.data?.user || !response?.data?.token) {
        throw new Error(response?.message || 'Login succeeded but user or token is missing');
      }
      login(response.data.user, response.data.token);
      showToast(t('auth.login_success'), 'success');
      navigate(response.data.user?.isAdmin ? '/admin' : '/');
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
          <h1>{t('auth.login_title')}</h1>
          <p>{t('auth.login_subtitle')}</p>
        </div>

        <form className="form-v2" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="login-email">{t('auth.email_label')}</label>
            <div className="form-input-shell">
              <Mail size={16} style={{ color: 'var(--muted)', marginLeft: 14, flexShrink: 0 }} />
              <input
                id="login-email"
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
            <label htmlFor="login-password">{t('auth.password_label')}</label>
            <div className="form-input-shell">
              <LockKeyhole size={16} style={{ color: 'var(--muted)', marginLeft: 14, flexShrink: 0 }} />
              <input
                id="login-password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder={t('auth.password_placeholder')}
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary full-width btn-glow" disabled={isSubmitting} style={{ marginTop: 6 }}>
            <LogIn size={17} />
            {isSubmitting ? t('auth.logging_in') : t('auth.login_btn')}
          </button>
        </form>

        <p className="auth-footer-v2">
          {t('auth.no_account')}{' '}
          <Link to="/register">{t('auth.create_one')}</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
