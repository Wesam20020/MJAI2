import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  ClipboardCheck,
  GraduationCap,
  Activity,
  RefreshCw,
  TrendingUp,
  UserRound,
  Mail,
  Clock3,
  Sparkles,
  BarChart3,
  UserPlus,
  FileText,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
  Shield,
  User,
  CalendarDays,
} from 'lucide-react';
import { fetchAdminDashboard, getAdminUsersExportUrl } from '../api/apiClient';

const PAGE_SIZE = 8;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatCompactDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function StatCard({ icon: Icon, label, value, helper }) {
  return (
    <article className="admin-stat-card glass-panel">
      <div className="admin-stat-icon"><Icon size={20} /></div>
      <div>
        <p className="admin-stat-label">{label}</p>
        <h3>{value}</h3>
        <p className="admin-stat-helper">{helper}</p>
      </div>
    </article>
  );
}

function EmptyState({ message }) {
  return <p className="admin-empty-text">{message}</p>;
}

function ActivityList({ items, type, emptyMessage }) {
  if (!items.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="admin-activity-list">
      {items.map((item) => (
        <article className="admin-activity-item" key={`${type}-${item.id || item.timestamp || item.title}`}>
          <div className="admin-activity-badge">
            {type === 'registration' && <UserPlus size={16} />}
            {type === 'assessment' && <ClipboardCheck size={16} />}
            {type === 'result' && <Sparkles size={16} />}
            {type === 'timeline' && <Activity size={16} />}
          </div>
          <div>
            <h4>{item.title || item.name}</h4>
            <p>{item.description || item.email || item.recommendedMajor || item.status || ''}</p>
            <span>{formatDate(item.timestamp || item.createdAt || item.completedAt)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function MetricLineChart({ items, emptyMessage, valueLabel }) {
  if (!items.length) return <EmptyState message={emptyMessage} />;

  const width = 420;
  const height = 180;
  const padding = 20;
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const stepX = items.length > 1 ? (width - padding * 2) / (items.length - 1) : 0;

  const points = items.map((item, index) => ({
    x: padding + index * stepX,
    y: height - padding - ((item.value || 0) / maxValue) * (height - padding * 2),
    label: item.label,
    value: item.value
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
  const gradId = `chart-fill-${valueLabel.replace(/\s+/g, '-')}`;

  return (
    <div className="admin-svg-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="admin-line-chart" role="img" aria-label={valueLabel}>
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(92, 240, 212, 0.55)" />
            <stop offset="100%" stopColor="rgba(83, 167, 255, 0.05)" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => {
          const y = height - padding - f * (height - padding * 2);
          return <line key={f} x1={padding} x2={width - padding} y1={y} y2={y} className="admin-grid-line" />;
        })}
        <path d={areaPath} fill={`url(#${gradId})`} className="admin-area-path" />
        <path d={linePath} fill="none" className="admin-line-path" />
        {points.map((p) => (
          <circle key={`${p.label}-${p.value}`} cx={p.x} cy={p.y} r="4.5" className="admin-line-point" />
        ))}
      </svg>
      <div className="admin-chart-axis-labels">
        {items.map((item) => (
          <div key={`${item.label}-axis`} className="admin-axis-label">
            <span>{formatCompactDate(item.label)}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBarChart({ items, emptyMessage }) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  if (!items.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="admin-mini-chart enhanced">
      {items.map((item) => (
        <div className="admin-bar-row" key={`${item.label}-${item.value}`}>
          <div className="admin-bar-meta">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <div className="admin-bar-track">
            <div className="admin-bar-fill" style={{ width: `${Math.max((item.value / maxValue) * 100, 8)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function UserRoleBadge({ role, adminLabel, userLabel }) {
  const isAdminRole = role === 'admin';
  return (
    <span className={`admin-role-badge ${isAdminRole ? 'is-admin' : 'is-user'}`}>
      {isAdminRole ? <Shield size={14} /> : <User size={14} />}
      <span>{isAdminRole ? adminLabel : userLabel}</span>
    </span>
  );
}

function AdminPage() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadDashboard = async ({ nextPage = page, nextSearch = searchTerm, silent = false } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const response = await fetchAdminDashboard({ page: nextPage, pageSize: PAGE_SIZE, search: nextSearch });
      setDashboard(response.data);
      setPage(nextPage);
      setSearchTerm(nextSearch);
      setSearchInput(nextSearch);
      setError('');
    } catch (err) {
      setError(err.message || t('errors.load_failed'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard({ nextPage: 1, nextSearch: '' });
  }, []);

  const topMajorSummary = useMemo(() => {
    const topMajors = dashboard?.summary?.mostRecommendedMajors || [];
    if (!topMajors.length) return t('admin.no_recommendation');
    return topMajors.map((item) => `${item.major} (${item.count})`).join(' • ');
  }, [dashboard, t]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    loadDashboard({ nextPage: 1, nextSearch: searchInput.trim(), silent: true });
  };

  const handleResetSearch = () => {
    setSearchInput('');
    loadDashboard({ nextPage: 1, nextSearch: '', silent: true });
  };

  const handleExport = () => {
    const exportUrl = getAdminUsersExportUrl(searchTerm);
    const token = localStorage.getItem('token');

    fetch(exportUrl, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(async (response) => {
        if (!response.ok) {
          let message = `Export failed with status ${response.status}`;
          try {
            const data = await response.json();
            message = data?.message || message;
          } catch { /* ignore */ }
          throw new Error(message);
        }
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `admin-users-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        setError(err.message || t('errors.export_failed'));
      });
  };

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

  if (error && !dashboard) {
    return (
      <section className="page-section admin-page">
        <div className="admin-shell glass-panel admin-state-card">
          <h1>{t('admin.title')}</h1>
          <p className="error-text">{error}</p>
          <button type="button" className="btn btn-primary btn-glow" onClick={() => loadDashboard()}>
            <RefreshCw size={18} />
            <span>{t('admin.retry')}</span>
          </button>
        </div>
      </section>
    );
  }

  const summary = dashboard?.summary || {};
  const users = dashboard?.users || [];
  const usersMeta = dashboard?.usersMeta || null;
  const activity = dashboard?.activity || {};
  const analytics = dashboard?.analytics || {};

  return (
    <section className="page-section admin-page">
      <div className="admin-shell">
        <div className="admin-hero glass-panel">
          <div>
            <p className="result-kicker">{t('admin.kicker')}</p>
            <h1>{t('admin.title')}</h1>
            <p className="admin-hero-text">{t('admin.subtitle')}</p>
          </div>
          <div className="admin-hero-actions">
            <div className="admin-hero-chip glass-panel-soft">
              <CalendarDays size={16} />
              <span>{t('admin.last_reg')}: {formatDate(summary.latestRegistrationAt)}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadDashboard({ silent: true })}
              disabled={isRefreshing}
            >
              <RefreshCw size={18} className={isRefreshing ? 'spin' : ''} />
              <span>{isRefreshing ? t('admin.refreshing') : t('admin.refresh')}</span>
            </button>
          </div>
        </div>

        {!!error && <p className="error-text admin-inline-error">{error}</p>}

<div className="admin-stats-grid">
          <StatCard icon={Users} label={t('admin.total_users')} value={summary.totalUsers ?? 0}
            helper={`${t('admin.matching')}: ${usersMeta?.totalFilteredUsers ?? 0}`} />
          <StatCard icon={ClipboardCheck} label={t('admin.total_attempts')} value={summary.totalAttempts ?? 0}
            helper={t('admin.attempts_helper')} />
          <StatCard icon={GraduationCap} label={t('admin.most_recommended')} value={topMajorSummary}
            helper={t('admin.majors_helper')} />
          <StatCard icon={Activity} label={t('admin.recent_activity')}
            value={summary.recentActivityCount ?? dashboard?.recentActivity?.length ?? 0}
            helper={t('admin.activity_helper')} />
        </div>

        <section className="admin-panel glass-panel">
            <div className="admin-panel-header">
              <div>
                <p className="admin-section-kicker">{t('admin.user_management')}</p>
                <h2>{t('admin.user_overview')}</h2>
              </div>
              <UserRound size={20} />
            </div>

            <div className="admin-toolbar-row">
              <form className="admin-search-form" onSubmit={handleSearchSubmit}>
                <div className="admin-search-input-shell">
                  <Search size={17} />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={t('admin.search_placeholder')}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-glow" disabled={isRefreshing}>
                  <Filter size={16} />
                  <span>{t('admin.search_btn')}</span>
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleResetSearch} disabled={isRefreshing}>
                  {t('admin.reset_btn')}
                </button>
              </form>
              <button type="button" className="btn btn-secondary" onClick={handleExport}>
                <Download size={16} />
                <span>{t('admin.export_csv')}</span>
              </button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.col_name')}</th>
                    <th>{t('admin.col_email')}</th>
                    <th>{t('admin.col_role')}</th>
                    <th>{t('admin.col_attempts')}</th>
                    <th>{t('admin.col_major')}</th>
                    <th>{t('admin.col_activity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length ? (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className="admin-user-cell">
                            <strong>{user.name}</strong>
                            <span>ID #{user.id}</span>
                          </div>
                        </td>
                        <td>{user.email}</td>
                        <td>
                          <UserRoleBadge
                            role={user.role}
                            adminLabel={t('admin.role_admin')}
                            userLabel={t('admin.role_user')}
                          />
                        </td>
                        <td>{user.attempts}</td>
                        <td>{user.latestRecommendedMajor}</td>
                        <td>{formatDate(user.latestAttemptAt || user.joinedAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">
                        <EmptyState message={t('admin.no_users')} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {usersMeta && (
              <div className="admin-pagination-row">
                <p>
                  {t('admin.page_of', { page: usersMeta.page, total: usersMeta.totalPages })} ·{' '}
                  <strong>{usersMeta.totalFilteredUsers}</strong> {t('admin.matching')}
                </p>
                <div className="admin-pagination-controls">
                  <button
                    type="button"
                    className="btn btn-secondary admin-page-btn"
                    onClick={() => loadDashboard({ nextPage: usersMeta.page - 1, silent: true })}
                    disabled={!usersMeta.hasPreviousPage || isRefreshing}
                  >
                    <ChevronLeft size={16} />
                    <span>{t('admin.prev')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary admin-page-btn"
                    onClick={() => loadDashboard({ nextPage: usersMeta.page + 1, silent: true })}
                    disabled={!usersMeta.hasNextPage || isRefreshing}
                  >
                    <span>{t('admin.next')}</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="admin-panel glass-panel">
            <div className="admin-panel-header">
              <div>
                <p className="admin-section-kicker">{t('admin.recent_activity')}</p>
                <h2>{t('admin.timeline_title')}</h2>
              </div>
              <Clock3 size={20} />
            </div>
            <ActivityList
              items={dashboard?.recentActivity || []}
              type="timeline"
              emptyMessage={t('admin.no_activity')}
            />
          </section>

        <div className="admin-grid-three">
          <section className="admin-panel glass-panel">
            <div className="admin-panel-header compact">
              <div>
                <p className="admin-section-kicker">{t('admin.recent_regs')}</p>
                <h2>{t('admin.newest_users')}</h2>
              </div>
              <UserPlus size={18} />
            </div>
            <ActivityList items={activity.recentRegistrations || []} type="registration" emptyMessage={t('admin.no_activity')} />
          </section>

          <section className="admin-panel glass-panel">
            <div className="admin-panel-header compact">
              <div>
                <p className="admin-section-kicker">{t('admin.recent_assessments')}</p>
                <h2>{t('admin.assessment_updates')}</h2>
              </div>
              <FileText size={18} />
            </div>
            <ActivityList items={activity.recentAssessments || []} type="assessment" emptyMessage={t('admin.no_activity')} />
          </section>

          <section className="admin-panel glass-panel">
            <div className="admin-panel-header compact">
              <div>
                <p className="admin-section-kicker">{t('admin.recent_results')}</p>
                <h2>{t('admin.latest_outcomes')}</h2>
              </div>
              <Sparkles size={18} />
            </div>
            <ActivityList items={activity.recentResults || []} type="result" emptyMessage={t('admin.no_activity')} />
          </section>
        </div>

        <section className="admin-panel glass-panel">
          <div className="admin-panel-header">
            <div>
              <p className="admin-section-kicker">{t('admin.analytics')}</p>
              <h2>{t('admin.rec_trends')}</h2>
            </div>
            <TrendingUp size={20} />
          </div>

          <div className="admin-analytics-grid enhanced">
            <div className="admin-chart-card glass-panel-soft admin-chart-card-wide">
              <div className="admin-chart-title-row">
                <BarChart3 size={18} />
                <h3>{t('admin.recs_by_major')}</h3>
              </div>
              <HorizontalBarChart
                items={analytics.recommendationTrends || []}
                emptyMessage={t('admin.no_recommendation')}
              />
            </div>

            <div className="admin-chart-card glass-panel-soft">
              <div className="admin-chart-title-row">
                <ClipboardCheck size={18} />
                <h3>{t('admin.attempts_7d')}</h3>
              </div>
              <MetricLineChart
                items={analytics.attemptsLast7Days || []}
                emptyMessage={t('admin.no_activity')}
                valueLabel={t('admin.attempts_7d')}
              />
            </div>

            <div className="admin-chart-card glass-panel-soft">
              <div className="admin-chart-title-row">
                <Mail size={18} />
                <h3>{t('admin.regs_7d')}</h3>
              </div>
              <MetricLineChart
                items={analytics.registrationsLast7Days || []}
                emptyMessage={t('admin.no_activity')}
                valueLabel={t('admin.regs_7d')}
              />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

export default AdminPage;
