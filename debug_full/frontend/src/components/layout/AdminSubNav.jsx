import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Users, ListChecks, BarChart3 } from 'lucide-react';

export default function AdminSubNav() {
  const { t } = useTranslation();
  const cls = ({ isActive }) => `admin-subnav-link${isActive ? ' active' : ''}`;

  return (
    <nav className="admin-subnav anim-fade-up" style={{ marginBottom: 24 }}>
      <NavLink to="/admin" end className={cls}>
        <LayoutDashboard size={16} /> {t('admin.title')}
      </NavLink>
      <NavLink to="/admin/users" className={cls}>
        <Users size={16} /> {t('admin.user_management')}
      </NavLink>
      <NavLink to="/admin/questions" className={cls}>
        <ListChecks size={16} /> Questions
      </NavLink>
      <NavLink to="/admin/analytics" className={cls}>
        <BarChart3 size={16} /> {t('admin.analytics')}
      </NavLink>
    </nav>
  );
}
