import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity, UserPlus, ClipboardCheck, Sparkles,
  RefreshCw, Clock3,
} from 'lucide-react';
import { fetchAdminDashboard } from '../api/apiClient';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function ActivityItem({ item, type }) {
  const iconMap = {
    registration: <UserPlus size={16} />,
    assessment: <ClipboardCheck size={16} />,
    result: <Sparkles size={16} />,
    timeline: <Activity size={16} />,
  };

  return (
    <article className="admin-activity-item">
      <div className="admin-activity-badge">{iconMap[type] || <Activity size={16} />}</div>
      <div className="admin-activity-content">
        <h4>{item.title || item.name || '—'}</h4>
        <p>{item.description || item.email || item.recommendedMajor || item.status || ''}</p>
        <span className="admin-activity-time">
          <Clock3 size={12} />
          {formatDate(item.timestamp || item.createdAt || item.completedAt)}
        </span>
      </div>
    </article>
  );
}

function ActivitySection({ title, items, type, emptyMessage }) {
  return (
    <section className="admin-panel glass-panel">
      <div className="admin-panel-header">
        <h2>{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="admin-empty-text">{emptyMessage}</p>
      ) : (
        <div className="admin-activity-list">
          {items.map((item, i) => (
            <ActivityItem
              key={`${type}-${item.id || item.timestamp || i}`}
              item={item}
              type={type}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AdminActivityPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async ({ silent = false } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const res = await fetchAdminDashboard({ page: 1, pageSize: 50, search: '' });
      setData(res.data);
      setError('');
    } catch (err) {
      setError(err.message || t('errors.load_failed'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const timeline = data?.recentActivity || [];
  const registrations = data?.activity?.recentRegistrations || [];
  const assessments = data?.activity?.recentAssessments || [];
  const results = data?.activity?.recentResults || [];

  if (isLoading) {
    return (
      <section className="page-section admin-page">
        <div className="admin-shell glass-panel admin-state-card loading-state">
          <div className="loading-spinner" />
          <p>{t('admin.loading')}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section admin-page">
      <div className="admin-shell">

        <div className="admin-hero glass-panel">
          <div>
            <p className="result-kicker">{t('admin.kicker')}</p>
            <h1>{t('admin.recent_activity', 'Recent Activity')}</h1>
            <p className="admin-hero-text">{t('admin.system_timeline_sub')}</p>
          </div>
          <div className="admin-hero-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => load({ silent: true })}
              disabled={isRefreshing}
            >
              <RefreshCw size={18} className={isRefreshing ? 'spin' : ''} />
              <span>{isRefreshing ? t('admin.refreshing') : t('admin.refresh')}</span>
            </button>
          </div>
        </div>

        {!!error && <p className="error-text admin-inline-error">{error}</p>}

        <ActivitySection
          title={t('admin.system_timeline')}
          items={timeline}
          type="timeline"
          emptyMessage={t('admin.no_activity')}
        />

        <div className="admin-grid-three">
          <ActivitySection
            title={t('admin.newest_users', 'New Registrations')}
            items={registrations}
            type="registration"
            emptyMessage={t('admin.no_activity')}
          />
          <ActivitySection
            title={t('admin.assessment_updates', 'Recent Assessments')}
            items={assessments}
            type="assessment"
            emptyMessage={t('admin.no_activity')}
          />
          <ActivitySection
            title={t('admin.latest_outcomes', 'Recent Results')}
            items={results}
            type="result"
            emptyMessage={t('admin.no_activity')}
          />
        </div>

      </div>
    </section>
  );
}

export default AdminActivityPage;
