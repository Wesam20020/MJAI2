import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchMajors, compareMajors } from '../api/apiClient';
import { GitCompare, CheckSquare, Square } from 'lucide-react';

const DIFFICULTY_COLOR = {
  'Very Hard': '#ef4444',
  'Hard': '#f97316',
  'Medium': '#eab308',
  'Easy': '#22c55e'
};

function ComparePage() {
  const { t } = useTranslation();
  const [majors, setMajors] = useState([]);
  const [selected, setSelected] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [isLoadingMajors, setIsLoadingMajors] = useState(true);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMajors()
      .then(res => setMajors(res.data || []))
      .catch(err => setError(err.message || t('errors.load_failed')))
      .finally(() => setIsLoadingMajors(false));
  }, [t]);

  const toggleMajor = (name) => {
    setComparison(null);
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };

  const handleCompare = async () => {
    if (selected.length < 2) return;
    setIsComparing(true);
    setError('');
    try {
      const res = await compareMajors({ names: selected });
      setComparison(res.data);
    } catch (err) {
      setError(err.message || t('errors.load_failed'));
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitCompare size={22} style={{ color: 'var(--primary)' }} />
          {t('compare.title')}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.93rem' }}>{t('compare.subtitle')}</p>
      </div>

      {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}

      {isLoadingMajors ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)' }}>
          <div className="loading-spinner" />
          <span>{t('compare.loading_majors')}</span>
        </div>
      ) : (
        <div className="glass-card anim-fade-up" style={{ padding: '24px 28px', marginBottom: 24 }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 14 }}>
            {t('compare.select_label')} ({selected.length}/3)
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {majors.map(m => {
              const isSelected = selected.includes(m.name);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMajor(m.name)}
                  className={isSelected ? 'compare-chip compare-chip--selected' : 'compare-chip'}
                >
                  {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  {m.name}
                </button>
              );
            })}
          </div>

          {selected.length < 2 && selected.length > 0 && (
            <p style={{ fontSize: '0.8rem', color: '#f97316', marginBottom: 12 }}>{t('compare.min_warning')}</p>
          )}

          <button
            className="btn-primary"
            onClick={handleCompare}
            disabled={selected.length < 2 || isComparing}
            style={{ fontSize: '0.9rem', padding: '10px 24px' }}
          >
            {isComparing ? t('compare.comparing') : t('compare.compare_btn')}
          </button>
        </div>
      )}

      {comparison && comparison.length >= 2 && (
        <div className="anim-fade-up" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--muted)', fontSize: '0.82rem', fontWeight: 600, background: 'var(--panel-soft)' }}>{t('compare.col_field')}</th>
                {comparison.map(m => (
                  <th key={m.id} style={{ padding: '12px 16px', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 700, background: 'var(--panel-soft)', textAlign: 'center' }}>{m.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'description', label: t('compare.description') },
                { key: 'difficulty', label: t('compare.difficulty') },
                { key: 'salary', label: t('compare.salary') },
                { key: 'skills', label: t('compare.skills') },
                { key: 'subjects', label: t('compare.subjects') }
              ].map((row, ri) => (
                <tr key={row.key} style={{ background: ri % 2 === 0 ? 'var(--panel-soft)' : 'transparent' }}>
                  <td style={{ padding: '14px 16px', color: 'var(--muted)', fontSize: '0.83rem', fontWeight: 600, borderTop: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{row.label}</td>
                  {comparison.map(m => (
                    <td key={m.id} style={{ padding: '14px 16px', fontSize: '0.87rem', borderTop: '1px solid var(--line)', textAlign: 'center', verticalAlign: 'top', color: 'var(--text-soft)' }}>
                      {row.key === 'difficulty' ? (
                        <span style={{ color: DIFFICULTY_COLOR[m.difficulty] || 'var(--text)', fontWeight: 700 }}>{m.difficulty}</span>
                      ) : Array.isArray(m[row.key]) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                          {m[row.key].map((item, i) => (
                            <span key={i} className="admin-count-pill">{item}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ lineHeight: 1.5 }}>{m[row.key]}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ComparePage;
