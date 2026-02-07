import { Link, Outlet } from 'react-router-dom';

const Layout = () => {
  return (
    <div className="app-layout">
      <header className="app-header">
        <nav>
          <h1>وکیل پلاس</h1>
          <div className="nav-links">
            <Link to="/">خانه</Link>
            <Link to="/demo">نمایش کامپوننت‌ها</Link>
          </div>
        </nav>
      </header>
      
      <main className="app-main">
        <Outlet />
      </main>
      
      <footer className="app-footer">
        <p>&copy; 2026 وکیل پلاس • سیستم مدیریت پرونده‌های حقوقی</p>
      </footer>
    </div>
  );
};

export default Layout;
