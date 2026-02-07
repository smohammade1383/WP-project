import { useState } from 'react';
import { useAuthStore, useUIStore } from '../store';
import { Loading, ErrorMessage, SkeletonCard, SkeletonTable, SkeletonList } from '../components';
import './ComponentsDemo.css';

const ComponentsDemo = () => {
  const [showLoading, setShowLoading] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorType, setErrorType] = useState<'error' | 'network' | 'permission' | 'validation'>('error');
  const [skeletonType, setSkeletonType] = useState<'card' | 'table' | 'list'>('card');

  const { isAuthenticated, user } = useAuthStore();
  const { isSidebarOpen, toggleSidebar } = useUIStore();

  return (
    <div className="demo-page">
      <h2>نمایش کامپوننت‌های UX</h2>
      
      {/* Store Status */}
      <section className="demo-section">
        <h3>وضعیت State Management (Zustand)</h3>
        <div className="card">
          <p><strong>وضعیت احراز هویت:</strong> {isAuthenticated ? '✅ وارد شده' : '❌ خارج شده'}</p>
          <p><strong>کاربر:</strong> {user ? `${user.first_name} ${user.last_name}` : 'مهمان'}</p>
          <p><strong>وضعیت Sidebar:</strong> {isSidebarOpen ? 'باز' : 'بسته'}</p>
          <button onClick={toggleSidebar}>تغییر وضعیت Sidebar</button>
        </div>
      </section>

      {/* Loading Component */}
      <section className="demo-section">
        <h3>کامپوننت Loading</h3>
        <div className="demo-controls">
          <button onClick={() => setShowLoading(!showLoading)}>
            {showLoading ? 'مخفی کردن' : 'نمایش'} Loading
          </button>
        </div>
        {showLoading && (
          <div className="demo-preview">
            <Loading size="small" />
            <Loading size="medium" message="در حال بارگذاری..." />
            <Loading size="large" />
          </div>
        )}
      </section>

      {/* Error Component */}
      <section className="demo-section">
        <h3>کامپوننت پیام خطا</h3>
        <div className="demo-controls">
          <button onClick={() => setShowError(!showError)}>
            {showError ? 'مخفی کردن' : 'نمایش'} خطاها
          </button>
          <select 
            value={errorType} 
            onChange={(e) => setErrorType(e.target.value as any)}
          >
            <option value="error">خطای عمومی</option>
            <option value="network">خطای شبکه</option>
            <option value="permission">خطای دسترسی</option>
            <option value="validation">خطای اعتبارسنجی</option>
          </select>
        </div>
        {showError && (
          <div className="demo-preview">
            <ErrorMessage
              message="این یک پیام خطای نمونه است"
              type={errorType}
              onRetry={() => alert('تلاش مجدد...')}
              onDismiss={() => setShowError(false)}
            />
          </div>
        )}
      </section>

      {/* Skeleton Components */}
      <section className="demo-section">
        <h3>Skeleton Loading</h3>
        <div className="demo-controls">
          <button onClick={() => setSkeletonType('card')}>Card</button>
          <button onClick={() => setSkeletonType('table')}>Table</button>
          <button onClick={() => setSkeletonType('list')}>List</button>
        </div>
        <div className="demo-preview">
          {skeletonType === 'card' && (
            <div className="cards-grid">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}
          {skeletonType === 'table' && <SkeletonTable rows={5} />}
          {skeletonType === 'list' && <SkeletonList items={5} />}
        </div>
      </section>

      {/* Responsive Grid Demo */}
      <section className="demo-section">
        <h3>Responsive Grid (تغییر اندازه پنجره را امتحان کنید)</h3>
        <div className="cards-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card">
              <h4>کارت {i}</h4>
              <p>این کارت در سایزهای مختلف صفحه، responsive است</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flex Utilities Demo */}
      <section className="demo-section">
        <h3>Flex Utilities</h3>
        <div className="card">
          <div className="flex-between" style={{ marginBottom: '1rem' }}>
            <span>Flex Between</span>
            <button>دکمه</button>
          </div>
          <div className="flex-center" style={{ padding: '2rem', background: 'rgba(255,255,255,0.05)' }}>
            <span>Flex Center</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ComponentsDemo;
