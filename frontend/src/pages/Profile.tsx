import { authService } from '../services/auth.service';
import './Profile.css';

const Profile = () => {
  const user = authService.getUserData();

  if (!user) {
    return (
      <div className="profile-page">
        <div className="profile-section">
          <h2>⚠️ خطا</h2>
          <p>اطلاعات کاربری یافت نشد. لطفاً دوباره وارد شوید.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>👤 پروفایل من</h1>
      </div>

      <div className="profile-content">
        {/* Personal Information Section */}
        <div className="profile-section">
          <h2>📋 اطلاعات شخصی</h2>
          <div className="profile-info-grid">
            <div className="info-item">
              <span className="info-label">نام</span>
              <div className={`info-value ${!user.first_name ? 'empty' : ''}`}>
                {user.first_name || 'تعیین نشده'}
              </div>
            </div>

            <div className="info-item">
              <span className="info-label">نام خانوادگی</span>
              <div className={`info-value ${!user.last_name ? 'empty' : ''}`}>
                {user.last_name || 'تعیین نشده'}
              </div>
            </div>

            <div className="info-item">
              <span className="info-label">نام کاربری</span>
              <div className="info-value">{user.username}</div>
            </div>

            <div className="info-item">
              <span className="info-label">کد ملی</span>
              <div className="info-value">{user.national_id}</div>
            </div>
          </div>
        </div>

        {/* Contact Information Section */}
        <div className="profile-section">
          <h2>📞 اطلاعات تماس</h2>
          <div className="profile-info-grid">
            <div className="info-item">
              <span className="info-label">ایمیل</span>
              <div className="info-value">{user.email}</div>
            </div>

            <div className="info-item">
              <span className="info-label">شماره تماس</span>
              <div className="info-value">{user.phone_number}</div>
            </div>
          </div>
        </div>

        {/* Roles Section */}
        <div className="profile-section">
          <h2>🎭 نقش‌ها و دسترسی‌ها</h2>
          <div className="info-item">
            <span className="info-label">نقش‌های سیستمی</span>
            <div className="roles-list">
              {user.role_names && user.role_names.length > 0 ? (
                user.role_names.map((role: string, index: number) => (
                  <span key={index} className="role-tag">
                    {role}
                  </span>
                ))
              ) : (
                <span className="role-tag empty">کاربر عادی</span>
              )}
            </div>
          </div>
        </div>

        {/* Account Stats Section */}
        <div className="profile-section">
          <h2>📊 آمار حساب کاربری</h2>
          <div className="profile-stats">
            <div className="stat-card">
              <h3>نقش‌های فعال</h3>
              <p className="stat-value">
                {user.role_names?.length || 0}
              </p>
            </div>
            <div className="stat-card">
              <h3>وضعیت حساب</h3>
              <p className="stat-value">{user.is_active ? '✓' : '✗'}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="profile-section">
          <div className="profile-actions">
            <button className="profile-btn primary" disabled>
              ✏️ ویرایش اطلاعات
            </button>
            <button className="profile-btn secondary" disabled>
              🔒 تغییر رمز عبور
            </button>
          </div>
          <p style={{ marginTop: '1rem', color: '#7f8c8d', fontSize: '0.875rem' }}>
            * ویرایش اطلاعات به زودی فعال خواهد شد
          </p>
        </div>
      </div>
    </div>
  );
};

export default Profile;
