import { useTranslation } from 'react-i18next';
import { BookOpen, BriefcaseBusiness, Compass, Lightbulb, ScrollText } from 'lucide-react';

function ResultsDashboard({ result }) {
  const { t } = useTranslation();
  const studyPlan = Array.isArray(result.studyPlan) ? result.studyPlan : [];
  const subjects = Array.isArray(result.subjectDescriptions) ? result.subjectDescriptions : [];
  const careers = Array.isArray(result.careerPaths) ? result.careerPaths : [];

  return (
    <div className="results-stack">
      <div className="result-hero glass-panel-soft">
        <div className="feature-icon"><Compass size={22} /></div>
        <div>
          <p className="result-kicker">{t('results.recommended_major')}</p>
          <h2>{result.recommendedMajor}</h2>
          <p>{result.explanation}</p>
        </div>
      </div>

      {result.majorDescription && (
        <div className="result-section glass-panel-soft">
          <div className="section-title"><Lightbulb size={18} /><span>{t('results.major_desc')}</span></div>
          <p>{result.majorDescription}</p>
        </div>
      )}

      {studyPlan.length > 0 && (
        <div className="result-section glass-panel-soft">
          <div className="section-title"><ScrollText size={18} /><span>{t('results.study_plan')}</span></div>
          <div className="pill-list">
            {studyPlan.map((item, index) => (
              <span className="info-pill" key={index}>{item}</span>
            ))}
          </div>
        </div>
      )}

      {subjects.length > 0 && (
        <div className="result-section glass-panel-soft">
          <div className="section-title"><BookOpen size={18} /><span>{t('results.subjects')}</span></div>
          <ul className="info-list">
            {subjects.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {careers.length > 0 && (
        <div className="result-section glass-panel-soft">
          <div className="section-title"><BriefcaseBusiness size={18} /><span>{t('results.career_opportunities')}</span></div>
          <ul className="info-list">
            {careers.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {result.createdAt && (
        <small className="result-time">
          {t('results.saved_on')} {new Date(result.createdAt).toLocaleString()}
        </small>
      )}
    </div>
  );
}

export default ResultsDashboard;
