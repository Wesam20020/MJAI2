import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Send } from 'lucide-react';

function ContactPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Mail size={22} style={{ color: 'var(--primary)' }} />
        </div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 8 }}>{t('contact.title')}</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.93rem' }}>{t('contact.subtitle')}</p>
      </div>

      {submitted ? (
        <div className="glass-card anim-fade-up" style={{ padding: '40px 32px', textAlign: 'center' }}>
          <Send size={32} style={{ color: 'var(--primary)', marginBottom: 16 }} />
          <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>{t('contact.success')}</p>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{t('contact.note')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="glass-card anim-fade-up" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}>{t('contact.name_label')}</label>
            <input
              name="name" value={form.name} onChange={handleChange} required
              placeholder={t('contact.name_placeholder')}
              className="admin-inline-input"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}>{t('contact.email_label')}</label>
            <input
              name="email" value={form.email} onChange={handleChange} required type="email"
              placeholder={t('contact.email_placeholder')}
              className="admin-inline-input"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}>{t('contact.message_label')}</label>
            <textarea
              name="message" value={form.message} onChange={handleChange} required rows={5}
              placeholder={t('contact.message_placeholder')}
              className="admin-inline-input"
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Send size={15} />
            {t('contact.send_btn')}
          </button>
          <p style={{ color: 'var(--muted)', fontSize: '0.78rem', textAlign: 'center' }}>{t('contact.note')}</p>
        </form>
      )}
    </div>
  );
}

export default ContactPage;
