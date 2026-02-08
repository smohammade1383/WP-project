import { Link, Outlet, useNavigate } from 'react-router-dom';
import { authService, authApi } from '../services';

const Layout = () => {
  const navigate = useNavigate();
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
        <nav>
          <h1>سامانه مدیریت پلیس</h1>
          <div className="nav-links">
            <Link to="/">خانه</Link>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard">داشبورد</Link>
                <span className="user-name">{user?.first_name} {user?.last_name}</span>
                <button onClick={handleLogout} className="logout-button">خروج</button>
              </>
            ) : (
              <Link to="/auth">ورود / ثبت‌نام</Link>
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
