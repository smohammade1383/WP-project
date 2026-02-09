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
      <header style={{
        background: 'transparent',
        padding: '0',
        boxShadow: 'none',
        border: 'none',
        borderBottom: 'none'
      }}>
        <nav style={{
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          padding: '1.5rem 2rem',
          direction: 'rtl'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.75rem',
            color: 'white',
            fontWeight: 700,
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            letterSpacing: '0.5px'
          }}>سامانه مدیریت پلیس</h1>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.875rem',
            width: '100%'
          }}>
            <Link to="/" style={{
              color: 'white',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '0.65rem 1.35rem',
              borderRadius: '10px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              fontSize: '0.95rem',
              textDecoration: 'none',
              backdropFilter: 'blur(10px)'
            }}>خانه</Link>
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" style={{
                  color: 'white',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  padding: '0.65rem 1.35rem',
                  borderRadius: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  fontSize: '0.95rem',
                  textDecoration: 'none',
                  backdropFilter: 'blur(10px)'
                }}>داشبورد</Link>
                <span style={{
                  color: 'white',
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '0.65rem 1.35rem',
                  borderRadius: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  fontSize: '0.95rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  👤 {user?.first_name} {user?.last_name}
                </span>
                <button onClick={handleLogout} style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: 'white',
                  padding: '0.65rem 1.35rem',
                  borderRadius: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>خروج</button>
              </>
            ) : (
              <Link to="/auth" style={{
                color: 'white',
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                padding: '0.65rem 1.35rem',
                borderRadius: '10px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                fontSize: '0.95rem',
                textDecoration: 'none',
                backdropFilter: 'blur(10px)'
              }}>ورود / ثبت‌نام</Link>
            )}
          </div>
        </nav>
      </header>
      
      <main className="app-main">
        <Outlet />
      </main>
      
      <footer className="app-footer" style={{
        background: 'transparent',
        padding: 'var(--spacing-xl) var(--spacing-lg)',
        textAlign: 'center'
      }}>
        <p>&copy; 2026 سامانه مدیریت پلیس • سیستم جامع مدیریت پرونده‌های پلیسی</p>
      </footer>
    </div>
  );
};

export default Layout;
