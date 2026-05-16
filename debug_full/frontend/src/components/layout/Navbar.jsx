import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, User, ChevronDown, LogOut, Settings, UserCircle, Moon, Sun } from 'lucide-react';
import { isRTL } from '../../i18n/index.js';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import logo from '../../majormatch-logo.png';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

function UserAvatar({ name, profileImage, size = 36 }) {
  if (profileImage) {
    return (
      <img
        src={profileImage}
        alt={name}
        className="navbar-avatar-img"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = (name || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="navbar-avatar-initials" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [langOpen, setLangOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const langRef = useRef(null);
  const profileRef = useRef(null);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute('dir', isRTL(i18n.language) ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', i18n.language);
  }, [i18n.language]);

  useEffect(() => {
    const handler = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const changeLanguage = (code) => {
    i18n.changeLanguage(code);
    setLangOpen(false);
  };

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/');
  };

  const profileImage = user?.profileImage || '';

  return (
    <header className="navbar glass-panel">
      {/* Left: Brand */}
      <NavLink to="/" className="navbar-brand">
        <div className="brand-mark">
          <img src={logo} alt="MajorMatch AI Logo" className="brand-logo-img" />
        </div>
        <div className="brand-copy">
          <span className="brand-title">MajorMatch AI</span>
          <span className="brand-subtitle">{t('nav.brand_subtitle', 'AI Major Advisor')}</span>
        </div>
      </NavLink>

      {/* Right: Profile chip + Language switcher */}
      <div className="navbar-right">

        {/* Profile avatar + dropdown — authenticated users */}
        {isAuthenticated && user && (
          <div className="navbar-profile-wrap" ref={profileRef}>
            <button
              type="button"
              className="navbar-profile-btn"
              onClick={() => setProfileOpen(p => !p)}
              aria-label={t('nav.profile')}
              aria-expanded={profileOpen}
            >
              <UserAvatar name={user.name} profileImage={profileImage} size={34} />
              <span className="navbar-profile-name">{user.name}</span>
              <ChevronDown size={14} className={`navbar-chevron${profileOpen ? ' open' : ''}`} />
            </button>

            {profileOpen && (
              <div className="navbar-profile-dropdown glass-panel">
                <NavLink to="/profile" className="navbar-dropdown-item" onClick={() => setProfileOpen(false)}>
                  <UserCircle size={16} /> {t('nav.profile')}
                </NavLink>
                <NavLink to="/profile/edit" className="navbar-dropdown-item" onClick={() => setProfileOpen(false)}>
                  <Settings size={16} /> {t('profile.edit_btn')}
                </NavLink>
                <button type="button" className="navbar-dropdown-item navbar-dropdown-danger" onClick={handleLogout}>
                  <LogOut size={16} /> {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Guest — show avatar placeholder linking to login */}
        {!isAuthenticated && (
          <NavLink to="/login" className="navbar-profile-btn" style={{ gap: 6 }}>
            <div className="navbar-avatar-initials" style={{ width: 34, height: 34, fontSize: 13 }}>
              <User size={16} />
            </div>
          </NavLink>
        )}

        {/* Theme toggle */}
        <button
          type="button"
          className={`theme-toggle ${isDark ? 'theme-toggle--dark' : 'theme-toggle--light'}`}
          onClick={toggleTheme}
          aria-label={isDark ? t('nav.switch_light', 'Switch to light mode') : t('nav.switch_dark', 'Switch to dark mode')}
        >
          <Moon size={13} className="theme-toggle__moon" aria-hidden="true" />
          <span className="theme-toggle__track">
            <span className="theme-toggle__knob" />
          </span>
          <Sun size={13} className="theme-toggle__sun" aria-hidden="true" />
        </button>

        {/* Language switcher */}
        <div className="lang-switcher" ref={langRef}>
          <button
            type="button"
            className="lang-btn"
            onClick={() => setLangOpen((p) => !p)}
            aria-label={t('nav.select_language', 'Select language')}
            aria-expanded={langOpen}
          >
            <Globe size={15} />
            <span>{currentLang.flag} {currentLang.code.toUpperCase()}</span>
          </button>

          {langOpen && (
            <div className="lang-dropdown glass-panel">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  className={`lang-option${i18n.language === lang.code ? ' lang-active' : ''}`}
                  onClick={() => changeLanguage(lang.code)}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
