import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth.service';
import { useModuleAccess } from '../hooks/useModuleAccess';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const user = authService.getUserData();
  const { availableModules } = useModuleAccess();

  const handleModuleClick = (route: string) => {
    navigate(route);
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1 >داشبورد</h1>
        <p className="welcome-text">
          خوش آمدید، {user?.first_name} {user?.last_name}
        </p>
        {user?.role_names && user.role_names.length > 0 && (
          <div className="user-roles">
            <span className="roles-label">نقش‌ها:</span>
            {user.role_names.map((role: string, index: number) => (
              <span key={index} className="role-badge">
                {role}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-content">
        {availableModules.length === 0 ? (
          <div className="no-modules-message">
            <p>هیچ ماژولی برای نمایش وجود ندارد.</p>
            <p>لطفاً با مدیر سیستم تماس بگیرید.</p>
          </div>
        ) : (
          <div className="modules-grid">
            {availableModules.map((module) => (
              <div
                key={module.id}
                className="module-card"
                onClick={() => handleModuleClick(module.route)}
                style={{ borderTopColor: module.color }}
              >
                {module.badge && (
                  <span className="module-badge">{module.badge}</span>
                )}
                <div className="module-icon">{module.icon}</div>
                <h3 className="module-title">{module.title}</h3>
                <p className="module-description">{module.description}</p>
                <div className="module-footer">
                  <span className="module-link">مشاهده →</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="dashboard-info">
          <div className="info-card">
            <h3>📊 آمار سریع</h3>
            <p>تعداد ماژول‌های در دسترس: <strong>{availableModules.length}</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
