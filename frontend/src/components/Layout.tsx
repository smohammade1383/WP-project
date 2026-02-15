import { Link, Outlet, useNavigate } from 'react-router-dom';
import { authService, authApi } from '../services';
import { useTheme } from '../hooks/useTheme';
import './Layout.css';

const Layout = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isAuthenticated = authService.isAuthenticated();
  const user = authService.getUserData();

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
        <nav className="app-nav">
          <div className="app-nav-top">
            <h1 className="app-title">سامانه مدیریت پلیس</h1>
            <button
              type="button"
              className="theme-toggle-button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'فعال کردن حالت روشن' : 'فعال کردن حالت تیره'}
              title={theme === 'dark' ? 'فعال کردن حالت روشن' : 'فعال کردن حالت تیره'}
            >
              <span className="theme-toggle-icon" aria-hidden="true">
                {theme === 'dark' ? '☀️' : '🌙'}
              </span>
              <span>{theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}</span>
            </button>
          </div>

          <div className="nav-links">
            <Link to="/" className="nav-link">خانه</Link>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="nav-link">داشبورد</Link>
                <span className="user-name">
                  {user?.first_name} {user?.last_name}
                </span>
                <button type="button" className="logout-button" onClick={handleLogout}>
                  خروج
                </button>
              </>
            ) : (
              <Link to="/auth" className="nav-link">
                ورود / ثبت‌نام
              </Link>
            )}
          </div>
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <p>&copy; 2026 سامانه مدیریت پلیس • سیستم جامع مدیریت پرونده‌های پلیسی</p>
      </footer>
    </div>
  );
};

export default Layout;
