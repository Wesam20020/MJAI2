import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminDashboard } from '../api/apiClient';
import { BarChart3, TrendingUp, Users, RefreshCw } from 'lucide-react';

function BarGroup({ data = [], color = '#6366f1', maxVal }) {
  const max = maxVal || Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ minWidth: 90, fontSize: '0.75rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
          <div style={{ flex: 1, height: 20, background: 'var(--panel-soft)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <div style={{ height: '100%', width: `${Math.round((item.value / max) * 100)}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)`, borderRadius: 4, minWidth: item.value > 0 ? 4 : 0, transition: 'width 0.5s ease' }} />
          </div>
          <span style={{ minWidth: 28, fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'right' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function AdminAnalyticsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetchAdminDashboard();
      setData(res.data);
    } catch (err) {
      setError(err.message || t('errors.load_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={20} style={{ color: 'var(--primary)' }} />
            {t('admin.analytics')}
          </h1>
        </div>
        <button onClick={load} className="admin-ghost-btn">
          <RefreshCw size={14} /> {t('admin.refresh')}
        </button>
      </div>

      {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}

      {isLoading ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)' }}>
          <div className="loading-spinner" />
          <span>{t('admin.loading')}</span>
        </div>
      ) : data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          <div className="glass-card anim-fade-up" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <Users size={16} style={{ color: 'var(--primary)' }} />
              <p style={{ fontWeight: 700 }}>{t('admin.regs_7d')}</p>
            </div>
            <BarGroup data={data.analytics?.registrationsLast7Days || []} color="#6366f1" />
          </div>

          <div className="glass-card anim-fade-up delay-100" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <TrendingUp size={16} style={{ color: '#22c55e' }} />
              <p style={{ fontWeight: 700 }}>{t('admin.attempts_7d')}</p>
            </div>
            <BarGroup data={data.analytics?.attemptsLast7Days || []} color="#22c55e" />
          </div>

          <div className="glass-card anim-fade-up delay-200" style={{ padding: '24px 28px', gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <BarChart3 size={16} style={{ color: '#f97316' }} />
              <p style={{ fontWeight: 700 }}>{t('admin.recs_by_major')}</p>
            </div>
            <BarGroup data={data.analytics?.recommendationTrends || []} color="#f97316" />
          </div>

          <div className="glass-card anim-fade-up delay-100" style={{ padding: '24px 28px' }}>
            <p style={{ fontWeight: 700, marginBottom: 16 }}>{t('admin.most_recommended')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data.summary?.mostRecommendedMajors || []).map((item, i) => (
                <div key={item.major} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="admin-rank-badge">{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.88rem' }}>{item.major}</span>
                  <span className="admin-count-pill">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card anim-fade-up delay-200" style={{ padding: '24px 28px' }}>
            <p style={{ fontWeight: 700, marginBottom: 16 }}>{t('admin.platform_summary')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{t('admin.total_users')}</span>
                <span style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--primary)' }}>{data.summary?.totalUsers || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{t('admin.total_attempts')}</span>
                <span style={{ fontWeight: 800, fontSize: '1.3rem', color: '#22c55e' }}>{data.summary?.totalAttempts || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminAnalyticsPage;
