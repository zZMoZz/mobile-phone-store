import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { loginApi, logoutApi, getMeApi } from '../api/auth.js';

const TOKEN_KEY = 'store.auth-token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  // Keep axios Authorization header in sync with token
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    getMeApi()
      .then((u) => setUser(u))
      .catch(() => {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 401 interceptor — auto-logout on expired token mid-session
  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && user) {
          handleLogout();
        }
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleLogout = useCallback(async () => {
    await logoutApi();
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const login = useCallback(async (username, password) => {
    const { token: t, user: u } = await loginApi(username, password);
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  const value = useMemo(
    () => ({ user, loading, isAdmin, login, logout: handleLogout }),
    [user, loading, isAdmin, login, handleLogout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
