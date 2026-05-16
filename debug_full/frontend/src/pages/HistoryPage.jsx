import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchUserHistory, fetchResultDetails } from '../api/apiClient';
import { History, Eye, CalendarDays, BarChart3 } from 'lucide-react';

function HistoryPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  useEffect(() => {
    const loadHistory = async () => {
      if (!user?.id) {
        setError(t('errors.user_missing'));
        setIsLoading(false);
        return;
      }
      try {
        const response = await fetchUserHistory(user.id);
        setHistory(response.data || []);
      } catch (err) {
        setError(err.message || t('errors.load_failed'));
      } finally {
        setIsLoading(false);
      }
    };
    loadHistory();
  }, [user, t]);

  const handleViewDetails = async (resultId) => {
    try {
      setIsDetailsLoading(true);
      const response = await fetchResultDetails(resultId);
      setSelectedResult(response.data);
    } catch (err) {
      setError(err.message || t('errors.load_failed'));
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  return (
    <div className="history-page-v2">
      <div className="history-shell-v2">

        {/* Header */}
        <div className="history-page-header anim-fade-in">
          <h1>{t('history.title')}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>{t('history.subtitle')}</p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--muted)', padding: '20px 0' }}>
            <div className="loading-spinner" />
            <span>{t('history.loading')}</span>
          </div>
        )}

        {/* Error */}
        {error && <p className="form-error">{error}</p>}

        {/* Empty */}
        {!isLoading && !error && history.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
            <History size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>{t('history.empty')}</p>
          </div>
        )}

        {/* History list */}
        {!isLoading && !error && history.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map((item, idx) => (
              <div
                key={item.resultId}
                className={`history-card-v2 anim-fade-up delay-${Math.min((idx + 1) * 100, 500)}`}
                onClick={() => navigate(`/results/${item.resultId}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="history-attempt-num">{item.attemptNumber}</div>
                <div className="history-card-body">
                  <p className="history-card-major">{item.recommendedMajor}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CalendarDays size={13} style={{ color: 'var(--muted)' }} />
                    <span className="history-card-meta">{formatDate(item.createdAt)}</span>
                    {item.topThreeMajors?.length > 0 && (
                      <>
                        <span className="history-card-meta" style={{ margin: '0 4px' }}>·</span>
                        <span className="history-card-meta">
                          {item.topThreeMajors.slice(0, 3).map(m => m.major).join(', ')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <Eye size={18} style={{ color: 'var(--primary)', opacity: 0.7 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Details panel */}
        {isDetailsLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="loading-spinner" />
          </div>
        )}

        {selectedResult && !isDetailsLoading && (
          <div className="history-detail-panel">
            <p className="history-detail-title">{t('history.details_title')}</p>
            <p style={{ marginBottom: 10 }}>
              <strong style={{ color: 'var(--primary)' }}>{t('history.recommended')}:</strong>{' '}
              <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{selectedResult.recommendedMajor}</span>
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.65, marginBottom: 18 }}>
              <strong>{t('history.explanation')}:</strong> {selectedResult.explanation}
            </p>

            {selectedResult.topThreeMajors?.length > 0 && (
              <>
                <p style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BarChart3 size={15} style={{ color: 'var(--primary)' }} />
                  {t('history.top3')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedResult.topThreeMajors.map((item, i) => (
                    <div key={`${item.major}-${i}`} className="result-ranked-item">
                      <span className="result-rank-badge">{i + 1}</span>
                      <span className="result-ranked-name">{item.major}</span>
                      <span className="result-ranked-score">{item.score}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default HistoryPage;
