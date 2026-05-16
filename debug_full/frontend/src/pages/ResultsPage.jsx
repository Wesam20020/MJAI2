import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { fetchLatestResult } from '../api/apiClient';
import { Sparkles, GraduationCap, BookOpen, Briefcase, BarChart3, MessageSquare, Trophy } from 'lucide-react';

function ResultsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLatestResult = async () => {
      if (!user?.id) {
        setError(t('errors.user_missing'));
        setIsLoading(false);
        return;
      }
      try {
        const response = await fetchLatestResult(user.id);
        setResult(response.data);
      } catch (err) {
        setError(err.message || t('errors.load_failed'));
      } finally {
        setIsLoading(false);
      }
    };
    loadLatestResult();
  }, [user, t]);

  if (isLoading) {
    return (
      <div className="results-page-v2">
        <div className="results-shell-v2" style={{ alignItems: 'center', paddingTop: 80 }}>
          <div className="loading-spinner" />
          <p style={{ color: 'var(--muted)' }}>{t('results.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="results-page-v2">
        <div className="results-shell-v2">
          <p className="form-error" style={{ textAlign: 'center', padding: 20 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="results-page-v2">
        <div className="results-shell-v2">
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>{t('results.no_result')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="results-page-v2">
      <div className="results-shell-v2">

        {/* ── Best match hero ───────────────────── */}
        <div className="result-hero-v2 anim-scale-in">
          <div className="result-hero-icon-v2">
            <Trophy size={30} style={{ color: '#fff' }} />
          </div>
          <p className="result-best-label">{t('results.best_match')}</p>
          <h1 className="result-major-name gradient-text">{result.recommendedMajor}</h1>
          <p style={{ color: 'var(--muted)', maxWidth: 560, lineHeight: 1.65, fontSize: '0.97rem' }}>
            {result.explanation}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-glow"
            onClick={() => navigate('/chat')}
            style={{ marginTop: 6 }}
          >
            <MessageSquare size={17} />
            {t('results.ask_ai')}
          </button>
        </div>

        {/* ── Data grid ────────────────────────── */}
        <div className="result-data-grid">

          {/* Top 3 */}
          {result.topThreeMajors?.length > 0 && (
            <div className="result-data-card anim-fade-up delay-100">
              <p className="result-data-card-title">
                <BarChart3 size={14} />
                {t('results.top_majors')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.topThreeMajors.map((item, i) => (
                  <div key={`top-${i}`} className="result-ranked-item">
                    <span className="result-rank-badge">{i + 1}</span>
                    <span className="result-ranked-name">{item.major}</span>
                    <span className="result-ranked-score">{item.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Major description */}
          {result.majorDescription && (
            <div className="result-data-card anim-fade-up delay-200">
              <p className="result-data-card-title">
                <GraduationCap size={14} />
                {t('results.major_desc')}
              </p>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.65 }}>
                {result.majorDescription}
              </p>
            </div>
          )}

          {/* Study plan */}
          {result.studyPlan?.length > 0 && (
            <div className="result-data-card anim-fade-up delay-200">
              <p className="result-data-card-title">
                <BookOpen size={14} />
                {t('results.study_plan')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.studyPlan.map((item, i) => (
                  <div key={`sp-${i}`} className="result-list-item">
                    <span className="result-list-num">{i + 1}</span>
                    <span style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.55 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subject descriptions */}
          {result.subjectDescriptions?.length > 0 && (
            <div className="result-data-card anim-fade-up delay-300">
              <p className="result-data-card-title">
                <BookOpen size={14} />
                {t('results.subjects')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.subjectDescriptions.map((item, i) => (
                  <div key={`sd-${i}`} className="result-list-item">
                    <span className="result-list-num">{i + 1}</span>
                    <span style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.55 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Career chips ─────────────────────── */}
        {result.careerOpportunities?.length > 0 && (
          <div className="result-data-card anim-fade-up delay-400">
            <p className="result-data-card-title">
              <Briefcase size={14} />
              {t('results.careers')}
            </p>
            <div className="career-chip-grid">
              {result.careerOpportunities.map((item, i) => (
                <span key={`c-${i}`} className="career-chip">{item}</span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default ResultsPage;
