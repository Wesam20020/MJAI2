import { useTranslation } from 'react-i18next';

function ProgressBar({ current, total }) {
  const { t } = useTranslation();
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="progress-wrap">
      <div className="progress-meta">
        <span>{t('results.progress_label')}</span>
        <span>{current}/{total}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default ProgressBar;
