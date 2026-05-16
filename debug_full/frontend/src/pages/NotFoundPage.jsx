import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home } from 'lucide-react';

function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="not-found-v2">
      <span className="not-found-code">404</span>
      <div className="not-found-v2-content anim-scale-in">
        <h1 className="gradient-text">{t('notfound.title')}</h1>
        <p>{t('notfound.subtitle')}</p>
        <Link to="/" className="btn btn-primary btn-glow" style={{ marginTop: 8 }}>
          <Home size={17} />
          {t('notfound.go_home')}
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
