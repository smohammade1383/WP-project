import { Outlet } from 'react-router-dom';

const Layout = () => {
  return (
    <div className="app-layout">
      <header className="app-header">
        <nav>
          <h1>وکیل پلاس</h1>
          {/* Navigation will be added here */}
        </nav>
      </header>
      
      <main className="app-main">
        <Outlet />
      </main>
      
      <footer className="app-footer">
        <p>&copy; 2026 وکیل پلاس</p>
      </footer>
    </div>
  );
};

export default Layout;
