import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, type LoginCredentials, type RegisterData } from '../services/auth.api';
import './Auth.css';

type AuthMode = 'login' | 'signup';

const Auth = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Login form state
  const [loginData, setLoginData] = useState<LoginCredentials>({
    identifier: '',
    password: '',
  });

  // Signup form state
  const [signupData, setSignupData] = useState<RegisterData>({
    username: '',
    email: '',
    phone_number: '',
    national_id: '',
    password: '',
    first_name: '',
    last_name: '',
  });

  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateLoginForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!loginData.identifier.trim()) {
      errors.identifier = 'نام کاربری، ایمیل، شماره تلفن یا کد ملی را وارد کنید';
    }

    if (!loginData.password) {
      errors.password = 'رمز عبور را وارد کنید';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSignupForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!signupData.username.trim()) {
      errors.username = 'نام کاربری الزامی است';
    } else if (signupData.username.length < 3) {
      errors.username = 'نام کاربری باید حداقل ۳ کاراکتر باشد';
    }

    if (!signupData.email.trim()) {
      errors.email = 'ایمیل الزامی است';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupData.email)) {
      errors.email = 'فرمت ایمیل نامعتبر است';
    }

    if (!signupData.phone_number.trim()) {
      errors.phone_number = 'شماره تلفن الزامی است';
    } else if (!/^09\d{9}$/.test(signupData.phone_number)) {
      errors.phone_number = 'فرمت شماره تلفن نامعتبر است (مثال: ۰۹۱۲۳۴۵۶۷۸۹)';
    }

    if (!signupData.national_id.trim()) {
      errors.national_id = 'کد ملی الزامی است';
    } else if (!/^\d{10}$/.test(signupData.national_id)) {
      errors.national_id = 'کد ملی باید ۱۰ رقم باشد';
    }

    if (!signupData.password) {
      errors.password = 'رمز عبور الزامی است';
    } else if (signupData.password.length < 8) {
      errors.password = 'رمز عبور باید حداقل ۸ کاراکتر باشد';
    }

    if (signupData.password !== confirmPassword) {
      errors.confirmPassword = 'رمز عبور و تکرار آن یکسان نیستند';
    }

    if (!signupData.first_name.trim()) {
      errors.first_name = 'نام الزامی است';
    }

    if (!signupData.last_name.trim()) {
      errors.last_name = 'نام خانوادگی الزامی است';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    if (!validateLoginForm()) {
      return;
    }

    try {
      setLoading(true);
      await authApi.login(loginData);
      navigate('/dashboard');
    } catch (err: any) {
      let errorMessage = 'خطا در ورود. لطفاً اطلاعات خود را بررسی کنید';
      
      if (err.detail) {
        errorMessage = typeof err.detail === 'string' 
          ? err.detail.trim().replace(/^\.+|\.+$/g, '') 
          : 'اطلاعات ورود نامعتبر است';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationErrors({});

    if (!validateSignupForm()) {
      return;
    }

    try {
      setLoading(true);
      await authApi.register(signupData);
      navigate('/dashboard');
    } catch (err: any) {
      let errorMessage = 'خطا در ثبت‌نام. لطفاً اطلاعات خود را بررسی کنید';
      
      if (err.detail) {
        // Handle both string and object errors
        if (typeof err.detail === 'string') {
          errorMessage = err.detail.trim().replace(/^\.+|\.+$/g, '');
        } else if (typeof err.detail === 'object') {
          // Set field-specific errors
          const fieldErrors: Record<string, string> = {};
          for (const [field, messages] of Object.entries(err.detail)) {
            const message = Array.isArray(messages) ? messages[0] : String(messages);
            fieldErrors[field] = message;
          }
          setValidationErrors(fieldErrors);
          errorMessage = 'لطفاً خطاهای فرم را بررسی کنید';
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError('');
    setValidationErrors({});
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>سامانه مدیریت پلیس</h1>
          <p>{mode === 'login' ? 'ورود به سیستم' : 'ثبت‌نام در سیستم'}</p>
        </div>

        {error && (
          <div className="auth-error">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="identifier">
                نام کاربری / ایمیل / شماره تلفن / کد ملی
                <span className="required">*</span>
              </label>
              <input
                type="text"
                id="identifier"
                value={loginData.identifier}
                onChange={(e) => setLoginData({ ...loginData, identifier: e.target.value })}
                className={validationErrors.identifier ? 'input-error' : ''}
                disabled={loading}
                placeholder="نام کاربری یا ایمیل یا شماره تلفن یا کد ملی"
              />
              {validationErrors.identifier && (
                <span className="field-error">{validationErrors.identifier}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">
                رمز عبور
                <span className="required">*</span>
              </label>
              <input
                type="password"
                id="password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                className={validationErrors.password ? 'input-error' : ''}
                disabled={loading}
                placeholder="رمز عبور خود را وارد کنید"
              />
              {validationErrors.password && (
                <span className="field-error">{validationErrors.password}</span>
              )}
            </div>

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? 'در حال ورود...' : 'ورود'}
            </button>

            <div className="auth-switch">
              حساب کاربری ندارید؟{' '}
              <button type="button" onClick={switchMode} className="switch-button">
                ثبت‌نام کنید
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="auth-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="first_name">
                  نام
                  <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="first_name"
                  value={signupData.first_name}
                  onChange={(e) => setSignupData({ ...signupData, first_name: e.target.value })}
                  className={validationErrors.first_name ? 'input-error' : ''}
                  disabled={loading}
                />
                {validationErrors.first_name && (
                  <span className="field-error">{validationErrors.first_name}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="last_name">
                  نام خانوادگی
                  <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="last_name"
                  value={signupData.last_name}
                  onChange={(e) => setSignupData({ ...signupData, last_name: e.target.value })}
                  className={validationErrors.last_name ? 'input-error' : ''}
                  disabled={loading}
                />
                {validationErrors.last_name && (
                  <span className="field-error">{validationErrors.last_name}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="username">
                نام کاربری
                <span className="required">*</span>
              </label>
              <input
                type="text"
                id="username"
                value={signupData.username}
                onChange={(e) => setSignupData({ ...signupData, username: e.target.value })}
                className={validationErrors.username ? 'input-error' : ''}
                disabled={loading}
                placeholder="حداقل ۳ کاراکتر"
              />
              {validationErrors.username && (
                <span className="field-error">{validationErrors.username}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="email">
                ایمیل
                <span className="required">*</span>
              </label>
              <input
                type="email"
                id="email"
                value={signupData.email}
                onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                className={validationErrors.email ? 'input-error' : ''}
                disabled={loading}
                placeholder="example@email.com"
              />
              {validationErrors.email && (
                <span className="field-error">{validationErrors.email}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="phone_number">
                  شماره تلفن
                  <span className="required">*</span>
                </label>
                <input
                  type="tel"
                  id="phone_number"
                  value={signupData.phone_number}
                  onChange={(e) => setSignupData({ ...signupData, phone_number: e.target.value })}
                  className={validationErrors.phone_number ? 'input-error' : ''}
                  disabled={loading}
                  placeholder="09123456789"
                />
                {validationErrors.phone_number && (
                  <span className="field-error">{validationErrors.phone_number}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="national_id">
                  کد ملی
                  <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="national_id"
                  value={signupData.national_id}
                  onChange={(e) => setSignupData({ ...signupData, national_id: e.target.value })}
                  className={validationErrors.national_id ? 'input-error' : ''}
                  disabled={loading}
                  placeholder="۱۰ رقم"
                  maxLength={10}
                />
                {validationErrors.national_id && (
                  <span className="field-error">{validationErrors.national_id}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="password">
                  رمز عبور
                  <span className="required">*</span>
                </label>
                <input
                  type="password"
                  id="password"
                  value={signupData.password}
                  onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                  className={validationErrors.password ? 'input-error' : ''}
                  disabled={loading}
                  placeholder="حداقل ۸ کاراکتر"
                />
                {validationErrors.password && (
                  <span className="field-error">{validationErrors.password}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">
                  تکرار رمز عبور
                  <span className="required">*</span>
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={validationErrors.confirmPassword ? 'input-error' : ''}
                  disabled={loading}
                />
                {validationErrors.confirmPassword && (
                  <span className="field-error">{validationErrors.confirmPassword}</span>
                )}
              </div>
            </div>

            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? 'در حال ثبت‌نام...' : 'ثبت‌نام'}
            </button>

            <div className="auth-switch">
              حساب کاربری دارید؟{' '}
              <button type="button" onClick={switchMode} className="switch-button">
                وارد شوید
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Auth;
