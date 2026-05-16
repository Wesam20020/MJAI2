import { useTranslation } from 'react-i18next';
import { Sparkles, Brain, Globe, Target } from 'lucide-react';

function AboutPage() {
  const { t } = useTranslation();

  const cards = [
    { icon: Target, titleKey: 'about.mission_title', textKey: 'about.mission_text' },
    { icon: Brain, titleKey: 'about.how_title', textKey: 'about.how_text' },
    { icon: Sparkles, titleKey: 'about.tech_title', textKey: 'about.tech_text' },
    { icon: Globe, titleKey: 'about.team_title', textKey: 'about.team_text' }
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ textAlign: 'center', marginBottom: 48 }}>
        <p style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>MAJORMATCH AI</p>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 12 }}>{t('about.title')}</h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', maxWidth: 520, margin: '0 auto' }}>{t('about.subtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {cards.map(({ icon: Icon, titleKey, textKey }, i) => (
          <div
            key={titleKey}
            className={`glass-card anim-fade-up delay-${i * 100}`}
            style={{ padding: '28px 28px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} style={{ color: 'var(--primary)' }} />
              </div>
              <p style={{ fontWeight: 700, fontSize: '1rem' }}>{t(titleKey)}</p>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>{t(textKey)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AboutPage;
