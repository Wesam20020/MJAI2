import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, BookOpen, GraduationCap,
  ArrowRight, BarChart3, MessagesSquare,
  ClipboardList, CheckCircle2, Zap, Star,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SplitText from '../components/reactbits/SplitText';

function HomePage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="page-section home-page">

      {/* ══════════════════════════════════════
          HERO — global FloatingLines bg from AppLayout
          ══════════════════════════════════════ */}
      <section className="hero-v2">
        <div className="hero-content">
          <div className="hero-eyebrow-pill anim-fade-in">
            <Sparkles size={13} />
            {t('home.eyebrow')}
          </div>

          {/*
            BUG #2 FIX: Do NOT wrap gradient-text in SplitText.
            GSAP splits text into display:inline-block spans.
            Those spans inherit -webkit-text-fill-color:transparent
            but parent's background-clip doesn't propagate → all chars invisible.
            Solution: plain h1 with gradient-text + CSS animation.
          */}
          <h1 className="hero-headline gradient-text anim-fade-up delay-100">
            {t('home.hero_title')}
          </h1>

          <p className="hero-lead anim-fade-up delay-200">
            {t('home.hero_subtitle')}
          </p>

          <div className="hero-cta-group anim-fade-up delay-300">
            {isAuthenticated ? (
              <>
                <Link to="/questionnaire" className="btn btn-primary btn-glow">
                  <ClipboardList size={18} />
                  <span>{t('home.cta_start')}</span>
                </Link>
                <Link to="/results" className="btn btn-secondary">
                  <BarChart3 size={18} />
                  <span>{t('home.cta_results')}</span>
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary btn-glow">
                  <ArrowRight size={18} />
                  <span>{t('home.cta_register')}</span>
                </Link>
                <Link to="/login" className="btn btn-secondary">
                  <span>{t('home.cta_login')}</span>
                </Link>
              </>
            )}
          </div>

          <div className="hero-social-proof anim-fade-in delay-400">
            <CheckCircle2 size={14} style={{ color: 'var(--accent)' }} />
            <span>{t('home.metric_free')}</span>
            <span className="hero-social-proof-dot" />
            <Zap size={13} style={{ color: 'var(--primary)' }} />
            <span>AI Powered</span>
            <span className="hero-social-proof-dot" />
            <Star size={13} style={{ color: '#f5c542' }} />
            <span>20+ Majors</span>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          STATS STRIP
          ══════════════════════════════════════ */}
      <div className="stats-strip anim-fade-up delay-400" style={{ maxWidth: 860, margin: '0 auto 72px' }}>
        <div className="stat-block">
          <span className="stat-block-value gradient-text">20+</span>
          <span className="stat-block-label">{t('home.metric_majors')}</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-value gradient-text">AI</span>
          <span className="stat-block-label">{t('home.metric_accuracy')}</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-value gradient-text">5</span>
          <span className="stat-block-label">{t('home.metric_time')}</span>
        </div>
        <div className="stat-block">
          <span className="stat-block-value gradient-text">{t('home.metric_free_value', 'Free')}</span>
          <span className="stat-block-label">{t('home.metric_free')}</span>
        </div>
      </div>

      {/* ══════════════════════════════════════
          HOW IT WORKS — SplitText on plain text (safe: no background-clip)
          ══════════════════════════════════════ */}
      <section className="info-section" style={{ maxWidth: 960, margin: '0 auto 72px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p className="section-eyebrow anim-fade-in">{t('home.how_title')}</p>
          <h2 className="section-headline" style={{ marginTop: 8 }}>
            <SplitText
              text={t('home.how_title')}
              tag="span"
              delay={35}
              duration={0.75}
              ease="power2.out"
              splitType="words"
              from={{ opacity: 0, y: 22 }}
              to={{ opacity: 1, y: 0 }}
              threshold={0.15}
              rootMargin="-40px"
              textAlign="center"
            />
          </h2>
        </div>
        <div className="feature-grid three-col">
          <div className="step-card anim-fade-up delay-100">
            <div className="step-number">1</div>
            <h3 className="step-title">{t('home.step1_title')}</h3>
            <p className="step-desc">{t('home.step1_desc')}</p>
          </div>
          <div className="step-card anim-fade-up delay-200">
            <div className="step-number">2</div>
            <h3 className="step-title">{t('home.step2_title')}</h3>
            <p className="step-desc">{t('home.step2_desc')}</p>
          </div>
          <div className="step-card anim-fade-up delay-300">
            <div className="step-number">3</div>
            <h3 className="step-title">{t('home.step3_title')}</h3>
            <p className="step-desc">{t('home.step3_desc')}</p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURES
          ══════════════════════════════════════ */}
      <section className="info-section" style={{ maxWidth: 960, margin: '0 auto 80px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p className="section-eyebrow anim-fade-in">{t('home.features_title')}</p>
          <h2 className="section-headline anim-fade-up delay-100" style={{ marginTop: 8 }}>
            {t('home.features_title')}
          </h2>
        </div>
        <div className="feature-grid four-col">
          <div className="feature-card glass-panel anim-fade-up delay-100">
            <div className="feature-icon"><BarChart3 size={22} /></div>
            <h3>{t('home.feature1_title')}</h3>
            <p>{t('home.feature1_desc')}</p>
          </div>
          <div className="feature-card glass-panel anim-fade-up delay-200">
            <div className="feature-icon"><GraduationCap size={22} /></div>
            <h3>{t('home.feature2_title')}</h3>
            <p>{t('home.feature2_desc')}</p>
          </div>
          <div className="feature-card glass-panel anim-fade-up delay-300">
            <div className="feature-icon"><BookOpen size={22} /></div>
            <h3>{t('home.feature3_title')}</h3>
            <p>{t('home.feature3_desc')}</p>
          </div>
          <div className="feature-card glass-panel anim-fade-up delay-400">
            <div className="feature-icon"><MessagesSquare size={22} /></div>
            <h3>{t('home.feature4_title')}</h3>
            <p>{t('home.feature4_desc')}</p>
          </div>
        </div>
      </section>

    </div>
  );
}

export default HomePage;
