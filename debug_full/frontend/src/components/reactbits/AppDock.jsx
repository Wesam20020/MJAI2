import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import Dock from './Dock';
import {
  Home, ClipboardList, BarChart3, MessageSquare,
  History, ShieldCheck, LogIn, UserPlus, LogOut,
  User, GitCompare, Info, HelpCircle, Mail,
  LayoutDashboard, Users, ListChecks, PieChart, Activity, BookOpen,
} from 'lucide-react';

export default function AppDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { isAuthenticated, isAdmin, logout } = useAuth();

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const cls = (path) => isActive(path) ? 'dock-item-active' : '';

  // Admin always sees only admin tools — never user navigation
  const onAdminPages = isAdmin;

  /* ── ADMIN DOCK ───────────────────────────────────── */
  if (onAdminPages) {
    return (
      <Dock
        items={[
          {
            icon: <LayoutDashboard size={18} />,
            label: t('admin.title', 'Dashboard'),
            onClick: () => navigate('/admin'),
            className: location.pathname === '/admin' ? 'dock-item-active' : '',
          },
          {
            icon: <Users size={18} />,
            label: t('admin.user_management', 'Users'),
            onClick: () => navigate('/admin/users'),
            className: cls('/admin/users'),
          },
          {
            icon: <ListChecks size={18} />,
            label: 'Questions',
            onClick: () => navigate('/admin/questions'),
            className: cls('/admin/questions'),
          },
          {
            icon: <PieChart size={18} />,
            label: t('admin.analytics', 'Analytics'),
            onClick: () => navigate('/admin/analytics'),
            className: cls('/admin/analytics'),
          },
          {
            icon: <Activity size={18} />,
            label: t('admin.recent_activity', 'Activity'),
            onClick: () => navigate('/admin/activity'),
            className: cls('/admin/activity'),
          },
          {
            icon: <User size={18} />,
            label: t('nav.profile', 'Profile'),
            onClick: () => navigate('/profile'),
            className: cls('/profile'),
          },
          {
            icon: <LogOut size={18} />,
            label: t('nav.logout', 'Logout'),
            onClick: () => { logout(); navigate('/'); },
            className: 'dock-item-danger',
          },
        ]}
        panelHeight={62}
        baseItemSize={46}
        magnification={64}
        distance={160}
      />
    );
  }

  /* ── USER DOCK ────────────────────────────────────── */
  const items = [
    {
      icon: <Home size={18} />,
      label: t('nav.home'),
      onClick: () => navigate('/'),
      className: location.pathname === '/' ? 'dock-item-active' : '',
    },
  ];

  if (isAuthenticated) {
    items.push(
      { icon: <ClipboardList size={18} />, label: t('nav.assessment'), onClick: () => navigate('/questionnaire'), className: cls('/questionnaire') },
      { icon: <BarChart3 size={18} />, label: t('nav.results'), onClick: () => navigate('/results'), className: cls('/results') },
      { icon: <MessageSquare size={18} />, label: t('nav.chat'), onClick: () => navigate('/chat'), className: cls('/chat') },
      { icon: <History size={18} />, label: t('nav.history'), onClick: () => navigate('/history'), className: cls('/history') },
      { icon: <GitCompare size={18} />, label: t('nav.compare'), onClick: () => navigate('/compare'), className: cls('/compare') },
      { icon: <BookOpen size={18} />, label: t('nav.courses', 'Courses'), onClick: () => navigate('/courses'), className: cls('/courses') },
      { icon: <User size={18} />, label: t('nav.profile'), onClick: () => navigate('/profile'), className: cls('/profile') },
    );

    if (isAdmin) {
      items.push({
        icon: <ShieldCheck size={18} />,
        label: t('nav.admin'),
        onClick: () => navigate('/admin'),
        className: '',
      });
    }

    items.push(
      { icon: <Info size={18} />, label: t('nav.about'), onClick: () => navigate('/about'), className: cls('/about') },
      { icon: <HelpCircle size={18} />, label: t('nav.faq'), onClick: () => navigate('/faq'), className: cls('/faq') },
      { icon: <Mail size={18} />, label: t('nav.contact'), onClick: () => navigate('/contact'), className: cls('/contact') },
    );

    items.push({
      icon: <LogOut size={18} />,
      label: t('nav.logout'),
      onClick: () => { logout(); navigate('/'); },
      className: 'dock-item-danger',
    });
  } else {
    items.push(
      { icon: <Info size={18} />, label: t('nav.about'), onClick: () => navigate('/about'), className: cls('/about') },
      { icon: <HelpCircle size={18} />, label: t('nav.faq'), onClick: () => navigate('/faq'), className: cls('/faq') },
      { icon: <Mail size={18} />, label: t('nav.contact'), onClick: () => navigate('/contact'), className: cls('/contact') },
      { icon: <LogIn size={18} />, label: t('nav.login'), onClick: () => navigate('/login'), className: cls('/login') },
      { icon: <UserPlus size={18} />, label: t('nav.register'), onClick: () => navigate('/register'), className: cls('/register') },
    );
  }

  return (
    <Dock
      items={items}
      panelHeight={62}
      baseItemSize={46}
      magnification={64}
      distance={160}
    />
  );
}
