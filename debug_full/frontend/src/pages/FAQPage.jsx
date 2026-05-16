import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

function FAQPage() {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState(null);

  const faqs = [1, 2, 3, 4, 5, 6].map(n => ({
    question: t(`faq.q${n}`),
    answer: t(`faq.a${n}`)
  }));

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 10 }}>{t('faq.title')}</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>{t('faq.subtitle')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {faqs.map((faq, i) => (
          <div
            key={i}
            className={`glass-card anim-fade-up delay-${Math.min(i * 50, 300)}`}
            style={{ overflow: 'hidden', cursor: 'pointer' }}
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', gap: 12 }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{faq.question}</p>
              <ChevronDown
                size={18}
                style={{
                  color: 'var(--primary)', flexShrink: 0,
                  transform: openIndex === i ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s'
                }}
              />
            </div>
            {openIndex === i && (
              <div style={{ padding: '0 22px 18px', color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.7, borderTop: '1px solid var(--line)' }}>
                <p style={{ paddingTop: 14 }}>{faq.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default FAQPage;
