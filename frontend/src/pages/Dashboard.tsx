import { authService } from '../services/auth.service';
import './Dashboard.css';

const Dashboard = () => {
  const user = authService.getUserData();

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>داشبورد</h1>
        <p>خوش آمدید، {user?.first_name} {user?.last_name}</p>
      </div>

      <div className="dashboard-content">
        <div className="welcome-card">
          <h2>به سامانه مدیریت پلیس خوش آمدید!</h2>
          <p>این داشبورد به زودی تکمیل خواهد شد.</p>
          
          <div className="user-info">
            <h3>اطلاعات کاربری:</h3>
            <ul>
              <li><strong>نام کاربری:</strong> {user?.username}</li>
              <li><strong>ایمیل:</strong> {user?.email}</li>
              <li><strong>شماره تلفن:</strong> {user?.phone_number}</li>
              <li><strong>کد ملی:</strong> {user?.national_id}</li>
              <li><strong>نقش‌ها:</strong> {user?.role_names?.join(', ') || 'کاربر عادی'}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
