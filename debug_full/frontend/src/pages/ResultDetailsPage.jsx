import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchResultDetails } from '../api/apiClient';
import {
  GraduationCap, BookOpen, Briefcase, BarChart3,
  FileText, ArrowLeft, CalendarDays
} from 'lucide-react';

function ResultDetailsPage() {
  const { t } = useTranslation();
  const { resultId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!resultId) {
      setError(t('errors.no_result_id'));
      setIsLoading(false);
      return;
    }
    fetchResultDetails(resultId)
      .then(res => setResult(res.data))
      .catch(err => setError(err.message || t('errors.load_failed')))
      .finally(() => setIsLoading(false));
  }, [resultId, t]);

  const formatDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };

  if (isLoading) {
    return (
      <div className="result-details-page">
        <div className="result-details-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: 14 }}>
          <div className="loading-spinner" />
          <span style={{ color: 'var(--muted)' }}>{t('results.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="result-details-page">
        <div className="result-details-shell">
          <p className="form-error">{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate('/history')}>
            <ArrowLeft size={16} /> {t('history.title')}
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const studyPlan = Array.isArray(result.studyPlan) ? result.studyPlan : [];
  const subjects = Array.isArray(result.subjectDescriptions) ? result.subjectDescriptions : [];
  const careers = Array.isArray(result.careerOpportunities) ? result.careerOpportunities : [];
  const topMajors = Array.isArray(result.topMajors) ? result.topMajors : [];

  return (
    <div className="result-details-page">
      <div className="result-details-shell">

        {/* Back button */}
        <button
          className="btn btn-secondary anim-fade-in"
          onClick={() => navigate('/history')}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft size={16} /> {t('history.title')}
        </button>

        {/* Hero */}
        <div className="result-hero-v2 anim-fade-up">
          <div className="result-hero-icon-v2">
            <GraduationCap size={32} color="#fff" />
          </div>
          <p className="result-best-label">{t('results.best_match')}</p>
          <h1 className="result-major-name gradient-text">{result.recommendedMajor}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: '0.88rem' }}>
            <CalendarDays size={14} />
            <span>{formatDate(result.createdAt)}</span>
          </div>
        </div>

        {/* Top Majors */}
        {topMajors.length > 0 && (
          <div className="glass-card result-detail-section anim-fade-up delay-100">
            <p className="result-detail-section-title">
              <BarChart3 size={16} /> {t('results.top_majors')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topMajors.slice(0, 5).map((item, i) => (
                <div key={`${item.major}-${i}`} className="result-ranked-item">
                  <span className="result-rank-badge">{i + 1}</span>
                  <span className="result-ranked-name">{item.major}</span>
                  {item.score && <span className="result-ranked-score">{item.score}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Explanation */}
        {result.explanation && (
          <div className="glass-card result-detail-section anim-fade-up delay-200">
            <p className="result-detail-section-title">
              <FileText size={16} /> {t('results.major_desc')}
            </p>
            <p className="result-detail-text">{result.explanation}</p>
            {result.majorDescription && (
              <p className="result-detail-text" style={{ marginTop: 12 }}>{result.majorDescription}</p>
            )}
          </div>
        )}

        {/* Study Plan */}
        {studyPlan.length > 0 && (
          <div className="glass-card result-detail-section anim-fade-up delay-300">
            <p className="result-detail-section-title">
              <BookOpen size={16} /> {t('results.study_plan')}
            </p>
            <div className="result-detail-list">
              {studyPlan.map((item, i) => (
                <div key={i} className="result-detail-list-item">
                  <span className="result-detail-list-num">{i + 1}</span>
                  <span>{typeof item === 'string' ? item : item.title || item.name || JSON.stringify(item)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subject Descriptions */}
        {subjects.length > 0 && (
          <div className="glass-card result-detail-section anim-fade-up delay-400">
            <p className="result-detail-section-title">
              <BookOpen size={16} /> {t('results.subjects')}
            </p>
            <div className="result-detail-list">
              {subjects.map((item, i) => (
                <div key={i} className="result-detail-list-item">
                  <span className="result-detail-list-num">{i + 1}</span>
                  <span>{typeof item === 'string' ? item : item.title || item.name || JSON.stringify(item)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Career Paths */}
        {careers.length > 0 && (
          <div className="glass-card result-detail-section anim-fade-up delay-500">
            <p className="result-detail-section-title">
              <Briefcase size={16} /> {t('results.careers')}
            </p>
            <div className="career-chip-grid">
              {careers.map((item, i) => (
                <span key={i} className="career-chip">
                  {typeof item === 'string' ? item : item.title || item.name || JSON.stringify(item)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResultDetailsPage;
