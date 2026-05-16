import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminQuestions, deleteAdminQuestion } from '../api/apiClient';
import { Trash2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

function AdminQuestionsPage() {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [actionId, setActionId] = useState(null);

  const loadQuestions = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetchAdminQuestions();
      setQuestions(res.data || []);
    } catch (err) {
      setError(err.message || t('errors.load_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadQuestions(); }, []); // eslint-disable-line

  const handleDelete = async (id, text) => {
    if (!window.confirm(t('admin.confirm_delete_question', { text: text.slice(0, 60) + '...' }))) return;
    setActionId(id);
    try {
      await deleteAdminQuestion(id);
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch (err) {
      setError(err.message || t('errors.submit_failed'));
    } finally {
      setActionId(null);
    }
  };

  const CATEGORY_COLORS = {
    Interests: '#6366f1',
    Skills: '#22c55e',
    'Work Style': '#f97316',
    'Future Goals': '#eab308'
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>{t('admin.questions_title')}</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{t('admin.questions_count', { count: questions.length })}</p>
        </div>
        <button onClick={loadQuestions} className="admin-ghost-btn">
          <RefreshCw size={14} /> {t('admin.refresh')}
        </button>
      </div>

      {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}

      {isLoading ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)' }}>
          <div className="loading-spinner" />
          <span>{t('admin.loading')}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {questions.map((q, i) => (
            <div key={q.id} className={`glass-card anim-fade-up delay-${Math.min(i * 30, 300)}`} style={{ overflow: 'hidden' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === q.id ? null : q.id)}
              >
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem', fontWeight: 700, minWidth: 28 }}>#{q.id}</span>
                <span style={{ background: CATEGORY_COLORS[q.category] || '#6366f1', borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{q.category}</span>
                <p style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-soft)' }}>{q.questionText}</p>
                <span style={{ color: 'var(--muted)', fontSize: '0.78rem', flexShrink: 0 }}>{q.options?.length || 0} opts</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(q.id, q.questionText); }}
                  disabled={actionId === q.id}
                  className="admin-action-btn admin-action-btn--danger"
                  style={{ flexShrink: 0 }}
                >
                  <Trash2 size={13} />
                </button>
                {expanded === q.id ? <ChevronDown size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
              </div>

              {expanded === q.id && (
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--line)' }}>
                  <p style={{ paddingTop: 12, fontSize: '0.88rem', marginBottom: 12, color: 'var(--text-soft)' }}>{q.questionText}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(q.options || []).map((opt, j) => (
                      <div key={opt.id || j} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--panel-soft)', borderRadius: 6, padding: '7px 12px', border: '1px solid var(--line)' }}>
                        <span style={{ color: 'var(--muted)', fontSize: '0.75rem', minWidth: 18 }}>{j + 1}.</span>
                        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-soft)' }}>{opt.optionText}</span>
                        <span className="admin-count-pill">{opt.targetMajor}</span>
                        <span style={{ color: 'var(--muted)', fontSize: '0.75rem', minWidth: 28, textAlign: 'right' }}>+{opt.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminQuestionsPage;
