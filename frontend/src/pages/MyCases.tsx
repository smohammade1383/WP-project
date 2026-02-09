import { useState } from 'react';
import { authService } from '../services/auth.service';
import './MyCases.css';

interface Case {
  id: number;
  title: string;
  caseNumber: string;
  status: 'active' | 'pending' | 'closed';
  description: string;
  createdDate: string;
  lastUpdate: string;
  priority: string;
}

const MyCases = () => {
  const user = authService.getUserData();
  
  // Mock data - in real app, this would come from API
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'closed'>('all');
  const [cases] = useState<Case[]>([
    {
      id: 1,
      title: 'پرونده سرقت خودرو',
      caseNumber: 'C-2026-001',
      status: 'active',
      description: 'بررسی پرونده سرقت خودرو پژو ۲۰۶ در منطقه ۵ تهران',
      createdDate: '۱۴۰۴/۱۱/۱۵',
      lastUpdate: '۱۴۰۴/۱۱/۲۱',
      priority: 'بالا',
    },
    {
      id: 2,
      title: 'پرونده کلاهبرداری اینترنتی',
      caseNumber: 'C-2026-002',
      status: 'pending',
      description: 'بررسی شکایت کلاهبرداری از طریق سایت‌های فروش آنلاین',
      createdDate: '۱۴۰۴/۱۱/۱۸',
      lastUpdate: '۱۴۰۴/۱۱/۲۰',
      priority: 'متوسط',
    },
    {
      id: 3,
      title: 'پرونده تصادف رانندگی',
      caseNumber: 'C-2026-003',
      status: 'closed',
      description: 'تصادف در اتوبان امام علی - بسته شده',
      createdDate: '۱۴۰۴/۱۱/۱۰',
      lastUpdate: '۱۴۰۴/۱۱/۱۹',
      priority: 'پایین',
    },
  ]);

  const filteredCases = filter === 'all' 
    ? cases 
    : cases.filter(c => c.status === filter);

  const activeCases = cases.filter(c => c.status === 'active').length;
  const pendingCases = cases.filter(c => c.status === 'pending').length;
  const closedCases = cases.filter(c => c.status === 'closed').length;

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'در حال بررسی';
      case 'pending': return 'در انتظار';
      case 'closed': return 'بسته شده';
      default: return status;
    }
  };

  return (
    <div className="my-cases-page">
      <div className="my-cases-header">
        <h1>📋 پرونده‌های من</h1>
        <p>پرونده‌های تحت مسئولیت شما</p>
      </div>

      {/* Statistics */}
      <div className="cases-stats">
        <div className="stat-card">
          <p className="stat-value">{activeCases}</p>
          <p className="stat-label">پرونده‌های فعال</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{pendingCases}</p>
          <p className="stat-label">در انتظار بررسی</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{closedCases}</p>
          <p className="stat-label">پرونده‌های بسته شده</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">{cases.length}</p>
          <p className="stat-label">مجموع پرونده‌ها</p>
        </div>
      </div>

      {/* Filters */}
      <div className="cases-filters">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          همه ({cases.length})
        </button>
        <button 
          className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          فعال ({activeCases})
        </button>
        <button 
          className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          در انتظار ({pendingCases})
        </button>
        <button 
          className={`filter-btn ${filter === 'closed' ? 'active' : ''}`}
          onClick={() => setFilter('closed')}
        >
          بسته شده ({closedCases})
        </button>
      </div>

      {/* Cases List */}
      {filteredCases.length === 0 ? (
        <div className="no-cases">
          <div className="no-cases-icon">📂</div>
          <h2>پرونده‌ای یافت نشد</h2>
          <p>هیچ پرونده‌ای با این فیلتر وجود ندارد</p>
        </div>
      ) : (
        <div className="cases-grid">
          {filteredCases.map((caseItem) => (
            <div key={caseItem.id} className={`case-card status-${caseItem.status}`}>
              <div className="case-header">
                <h3 className="case-title">{caseItem.title}</h3>
                <span className={`case-status ${caseItem.status}`}>
                  {getStatusText(caseItem.status)}
                </span>
              </div>

              <div className="case-info">
                <div className="info-item">
                  <span className="info-label">شماره پرونده</span>
                  <span className="info-value">{caseItem.caseNumber}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">تاریخ ثبت</span>
                  <span className="info-value">{caseItem.createdDate}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">آخرین به‌روزرسانی</span>
                  <span className="info-value">{caseItem.lastUpdate}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">اولویت</span>
                  <span className="info-value">{caseItem.priority}</span>
                </div>
              </div>

              <p className="case-description">{caseItem.description}</p>

              <div className="case-footer">
                <div className="case-actions">
                  <button className="action-btn primary">مشاهده جزئیات</button>
                  <button className="action-btn secondary">ویرایش</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Message */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        padding: '1.5rem',
        color: 'white',
        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
        marginTop: '2rem',
      }}>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>ℹ️ راهنما</h3>
        <p style={{ margin: 0, fontSize: '0.95rem', opacity: 0.95 }}>
          این صفحه نمایش نمونه است. داده‌های واقعی از API دریافت خواهند شد.
        </p>
      </div>
    </div>
  );
};

export default MyCases;
