import { useState } from 'react';
import { authService } from '../services/auth.service';
import { authApi, type User } from '../services/auth.api';
import './Profile.css';

const Profile = () => {
  const [user, setUser] = useState<User | null>(authService.getUserData());
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit profile form
  const [editData, setEditData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    phone_number: user?.phone_number || '',
  });

  // Change password form
  const [passwordData, setPasswordData] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

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

  const handleEditProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setValidationErrors({});
    setLoading(true);

    try {
      const updatedUser = await authApi.updateProfile(editData);
      setUser(updatedUser);
      setSuccess('اطلاعات با موفقیت به‌روزرسانی شد');
      setIsEditingProfile(false);
    } catch (err: any) {
      if (err.detail && typeof err.detail === 'object') {
        setValidationErrors(err.detail);
        setError('لطفاً خطاهای فرم را بررسی کنید');
      } else {
        setError(err.detail || err.message || 'خطا در به‌روزرسانی اطلاعات');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setValidationErrors({});

    // Client-side validation
    if (passwordData.new_password.length < 8) {
      setValidationErrors({ new_password: 'رمز عبور باید حداقل ۸ کاراکتر باشد' });
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      setValidationErrors({ confirm_password: 'رمز عبور جدید و تکرار آن یکسان نیستند' });
      return;
    }

    setLoading(true);

    try {
      await authApi.changePassword(passwordData);
      setSuccess('رمز عبور با موفقیت تغییر کرد');
      setIsChangingPassword(false);
      setPasswordData({
        old_password: '',
        new_password: '',
        confirm_password: '',
      });
    } catch (err: any) {
      if (err.detail && typeof err.detail === 'object') {
        setValidationErrors(err.detail);
        setError('لطفاً خطاهای فرم را بررسی کنید');
      } else {
        setError(err.detail || err.message || 'خطا در تغییر رمز عبور');
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setIsEditingProfile(false);
    setEditData({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone_number: user?.phone_number || '',
    });
    setError('');
    setValidationErrors({});
  };

  const cancelPasswordChange = () => {
    setIsChangingPassword(false);
    setPasswordData({
      old_password: '',
      new_password: '',
      confirm_password: '',
    });
    setError('');
    setValidationErrors({});
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>👤 پروفایل من</h1>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="message-box success">
          ✓ {success}
        </div>
      )}
      {error && !Object.keys(validationErrors).length && (
        <div className="message-box error">
          ⚠️ {error}
        </div>
      )}

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
              <p className="stat-value">{user.is_active ? 'فعال ✓' : 'غیرفعال ✗'}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="profile-section">
          <div className="profile-actions">
            <button 
              className="profile-btn primary" 
              onClick={() => setIsEditingProfile(true)}
              disabled={isEditingProfile || isChangingPassword}
            >
              ✏️ ویرایش اطلاعات
            </button>
            <button 
              className="profile-btn secondary"
              onClick={() => setIsChangingPassword(true)}
              disabled={isEditingProfile || isChangingPassword}
            >
              🔒 تغییر رمز عبور
            </button>
          </div>
        </div>

        {/* Edit Profile Form Modal */}
        {isEditingProfile && (
          <div className="modal-overlay" onClick={cancelEdit}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>✏️ ویرایش اطلاعات</h2>
                <button className="modal-close" onClick={cancelEdit}>×</button>
              </div>
              <form onSubmit={handleEditProfile} className="edit-form">
                <div className="form-group">
                  <label>نام</label>
                  <input
                    type="text"
                    value={editData.first_name}
                    onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                    className={validationErrors.first_name ? 'input-error' : ''}
                    disabled={loading}
                  />
                  {validationErrors.first_name && (
                    <span className="error-text">{validationErrors.first_name}</span>
                  )}
                </div>

                <div className="form-group">
                  <label>نام خانوادگی</label>
                  <input
                    type="text"
                    value={editData.last_name}
                    onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                    className={validationErrors.last_name ? 'input-error' : ''}
                    disabled={loading}
                  />
                  {validationErrors.last_name && (
                    <span className="error-text">{validationErrors.last_name}</span>
                  )}
                </div>

                <div className="form-group">
                  <label>ایمیل</label>
                  <input
                    type="email"
                    value={editData.email}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                    className={validationErrors.email ? 'input-error' : ''}
                    disabled={loading}
                  />
                  {validationErrors.email && (
                    <span className="error-text">{validationErrors.email}</span>
                  )}
                </div>

                <div className="form-group">
                  <label>شماره تماس</label>
                  <input
                    type="text"
                    value={editData.phone_number}
                    onChange={(e) => setEditData({ ...editData, phone_number: e.target.value })}
                    className={validationErrors.phone_number ? 'input-error' : ''}
                    disabled={loading}
                  />
                  {validationErrors.phone_number && (
                    <span className="error-text">{validationErrors.phone_number}</span>
                  )}
                </div>

                <div className="modal-actions">
                  <button type="submit" className="profile-btn primary" disabled={loading}>
                    {loading ? 'در حال ذخیره...' : '💾 ذخیره تغییرات'}
                  </button>
                  <button type="button" className="profile-btn secondary" onClick={cancelEdit} disabled={loading}>
                    انصراف
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Change Password Form Modal */}
        {isChangingPassword && (
          <div className="modal-overlay" onClick={cancelPasswordChange}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>🔒 تغییر رمز عبور</h2>
                <button className="modal-close" onClick={cancelPasswordChange}>×</button>
              </div>
              <form onSubmit={handleChangePassword} className="edit-form">
                <div className="form-group">
                  <label>رمز عبور فعلی</label>
                  <input
                    type="password"
                    value={passwordData.old_password}
                    onChange={(e) => setPasswordData({ ...passwordData, old_password: e.target.value })}
                    className={validationErrors.old_password ? 'input-error' : ''}
                    disabled={loading}
                    required
                  />
                  {validationErrors.old_password && (
                    <span className="error-text">{validationErrors.old_password}</span>
                  )}
                </div>

                <div className="form-group">
                  <label>رمز عبور جدید</label>
                  <input
                    type="password"
                    value={passwordData.new_password}
                    onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                    className={validationErrors.new_password ? 'input-error' : ''}
                    disabled={loading}
                    required
                    minLength={8}
                  />
                  {validationErrors.new_password && (
                    <span className="error-text">{validationErrors.new_password}</span>
                  )}
                  <span className="help-text">حداقل ۸ کاراکتر</span>
                </div>

                <div className="form-group">
                  <label>تکرار رمز عبور جدید</label>
                  <input
                    type="password"
                    value={passwordData.confirm_password}
                    onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                    className={validationErrors.confirm_password ? 'input-error' : ''}
                    disabled={loading}
                    required
                  />
                  {validationErrors.confirm_password && (
                    <span className="error-text">{validationErrors.confirm_password}</span>
                  )}
                </div>

                <div className="modal-actions">
                  <button type="submit" className="profile-btn primary" disabled={loading}>
                    {loading ? 'در حال ذخیره...' : '🔒 تغییر رمز عبور'}
                  </button>
                  <button type="button" className="profile-btn secondary" onClick={cancelPasswordChange} disabled={loading}>
                    انصراف
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
