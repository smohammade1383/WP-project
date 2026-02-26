import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { authApi, authService } from '../services';
import '../App.css';

type Theme = 'light' | 'dark';

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light';

  const saved = localStorage.getItem('wp-theme');
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = authService.isAuthenticated();
  const user = authService.getUserData();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const isDetectiveWorkspace =
    location.pathname === '/detective-board' || location.pathname.startsWith('/detective/');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('wp-theme', theme);
  }, [theme]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      authService.clearAuth();
      navigate('/');
    }
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <nav>
          <h1>سامانه مدیریت پلیس</h1>
          <div className="nav-links">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label="تغییر تم"
              title={theme === 'dark' ? 'تغییر به تم روشن' : 'تغییر به تم تیره'}
            >
              {theme === 'dark' ? '☀️ روشن' : '🌙 تیره'}
            </button>

            <Link to="/">خانه</Link>

            {isAuthenticated ? (
              <>
                <Link to="/dashboard">داشبورد</Link>
                <span className="user-name">
                  {user?.first_name} {user?.last_name}
                </span>
                <button type="button" onClick={handleLogout} className="logout-button">
                  خروج
                </button>
              </>
            ) : (
              <Link to="/auth">ورود / ثبت‌نام</Link>
            )}
          </div>
        </nav>
      </header>

      <main className={`app-main${isDetectiveWorkspace ? ' app-main--wide' : ''}`}>
        <Outlet />
      </main>

      <footer className="app-footer">
        <p>&copy; 2026 سامانه مدیریت پلیس • سیستم جامع مدیریت پرونده‌های پلیسی</p>
      </footer>
    </div>
  );
};

export default Layout;
