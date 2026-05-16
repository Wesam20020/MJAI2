import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('user');
      const savedToken = localStorage.getItem('token');

      if (savedUser && savedToken) {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      }
    } catch (error) {
      console.error('Failed to restore auth session:', error);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    } finally {
      setIsBootstrapped(true);
    }
  }, []);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', authToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  useEffect(() => {
    const handleExpired = () => logout();
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  // Normalise admin flag — backend has returned both isAdmin (camelCase) and
  // is_admin (snake_case) at different points; localStorage may hold either.
  const resolveAdmin = (u) =>
    Boolean(u?.isAdmin || u?.is_admin || u?.role === 'admin');

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isAdmin: resolveAdmin(user),
      isBootstrapped,
      login,
      logout
    }),
    [user, token, isBootstrapped]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
