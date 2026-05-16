import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminDashboard, deleteAdminUser, toggleAdminUser } from '../api/apiClient';
import { Trash2, Shield, ShieldOff, Search, RefreshCw } from 'lucide-react';

function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, totalFilteredUsers: 0 });
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionUserId, setActionUserId] = useState(null);

  const loadUsers = async (pageNum = page, searchVal = search) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetchAdminDashboard({ page: pageNum, pageSize: 10, search: searchVal });
      setUsers(res.data.users || []);
      setMeta(res.data.usersMeta || { page: 1, totalPages: 1, totalFilteredUsers: 0 });
    } catch (err) {
      setError(err.message || t('errors.load_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, [page, search]); // eslint-disable-line

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleReset = () => {
    setSearchInput('');
    setPage(1);
    setSearch('');
  };

  const handleDelete = async (userId, userName) => {
    if (!window.confirm(t('admin.confirm_delete_user', { name: userName }))) return;
    setActionUserId(userId);
    try {
      await deleteAdminUser(userId);
      loadUsers();
    } catch (err) {
      setError(err.message || t('errors.submit_failed'));
    } finally {
      setActionUserId(null);
    }
  };

  const handleToggleAdmin = async (userId, currentRole) => {
    const newIsAdmin = currentRole !== 'admin';
    setActionUserId(userId);
    try {
      await toggleAdminUser(userId, newIsAdmin);
      loadUsers();
    } catch (err) {
      setError(err.message || t('errors.submit_failed'));
    } finally {
      setActionUserId(null);
    }
  };

  const formatDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(d);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px' }}>
      <div className="anim-fade-in" style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>{t('admin.user_management')}</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{meta.totalFilteredUsers} {t('admin.matching')}</p>
      </div>

      {error && <p className="form-error" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="glass-card anim-fade-up" style={{ padding: '20px 24px', marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('admin.search_placeholder')}
          className="admin-inline-input"
        />
        <button className="btn-primary" onClick={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', fontSize: '0.88rem' }}>
          <Search size={14} /> {t('admin.search_btn')}
        </button>
        <button onClick={handleReset} className="admin-ghost-btn">
          <RefreshCw size={14} /> {t('admin.reset_btn')}
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted)', padding: '24px 0' }}>
          <div className="loading-spinner" />
          <span>{t('admin.loading')}</span>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {[t('admin.col_name'), t('admin.col_email'), t('admin.col_role'), t('admin.col_attempts'), t('admin.col_major'), t('admin.col_activity'), t('admin.col_actions')].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>{t('admin.no_users')}</td></tr>
              ) : users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.1s' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)' }}>{user.name}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: '0.83rem' }}>{user.email}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span className={`admin-role-pill ${user.role === 'admin' ? 'admin-role-pill--admin' : 'admin-role-pill--user'}`}>
                      {user.role === 'admin' ? t('admin.role_admin') : t('admin.role_user')}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: '0.85rem' }}>{user.attempts}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: '0.82rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.latestRecommendedMajor}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: '0.8rem' }}>{formatDate(user.latestAttemptAt || user.joinedAt)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleToggleAdmin(user.id, user.role)}
                        disabled={actionUserId === user.id}
                        title={user.role === 'admin' ? t('admin.remove_admin') : t('admin.make_admin')}
                        className="admin-action-btn admin-action-btn--promote"
                      >
                        {user.role === 'admin' ? <ShieldOff size={13} /> : <Shield size={13} />}
                      </button>
                      <button
                        onClick={() => handleDelete(user.id, user.name)}
                        disabled={actionUserId === user.id}
                        title={t('admin.delete_user')}
                        className="admin-action-btn admin-action-btn--danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && meta.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={meta.page <= 1}
            className="btn-primary"
            style={{ padding: '7px 16px', fontSize: '0.85rem', opacity: meta.page <= 1 ? 0.4 : 1 }}
          >
            {t('admin.prev')}
          </button>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {t('admin.page_of', { page: meta.page, total: meta.totalPages })}
          </span>
          <button
            onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
            disabled={meta.page >= meta.totalPages}
            className="btn-primary"
            style={{ padding: '7px 16px', fontSize: '0.85rem', opacity: meta.page >= meta.totalPages ? 0.4 : 1 }}
          >
            {t('admin.next')}
          </button>
        </div>
      )}
    </div>
  );
}

export default AdminUsersPage;
