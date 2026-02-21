import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { rewardsApi } from '../services';
import { hasAnyRole, useRoleRouterContext } from '../hooks/useRoleRouterContext';
import './RewardVerification.css';

const POLICE_ROLES = [
  'Administrator',
  'Chief',
  'Captain',
  'Sergeant',
  'Sergent',
  'Detective',
  'Police Officer',
  'Patrol Officer',
  'Cadet',
];

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
};

const RewardVerification = () => {
  const { isAuthenticated, roles } = useRoleRouterContext();
  const [nationalId, setNationalId] = useState('');
  const [uniqueCode, setUniqueCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    tracking_code: string;
    reward_amount: number;
    reporter: {
      username: string;
      national_id: string;
      first_name: string;
      last_name: string;
    };
    source?: string;
  } | null>(null);

  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (!hasAnyRole(roles, POLICE_ROLES)) return <Navigate to="/403" replace />;

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{10}$/.test(nationalId.trim())) {
      setError('کد ملی باید ۱۰ رقم باشد.');
      return;
    }
    if (!uniqueCode.trim()) {
      setError('کد رهگیری الزامی است.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const data = await rewardsApi.verifyByCode({
        national_id: nationalId.trim(),
        unique_code: uniqueCode.trim(),
      });
      setResult(data);
    } catch (err: unknown) {
      setResult(null);
      setError(getErrorMessage(err, 'استعلام پاداش ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  const reporterName = result
    ? `${result.reporter.first_name || ''} ${result.reporter.last_name || ''}`.trim() ||
      result.reporter.username
    : '';

  return (
    <div className="reward-verify-page">
      <header className="reward-verify-header">
        <h1>استعلام پاداش</h1>
        <p>با کد ملی شهروند و کد رهگیری، مبلغ پاداش و مشخصات گزارش‌دهنده را بررسی کنید.</p>
      </header>

      <form className="reward-verify-form" onSubmit={handleVerify}>
        <label>
          کد ملی
          <input
            type="text"
            inputMode="numeric"
            value={nationalId}
            onChange={(event) => setNationalId(event.target.value)}
            placeholder="مثال: 1234567890"
            maxLength={10}
          />
        </label>
        <label>
          کد رهگیری یکتا
          <input
            type="text"
            value={uniqueCode}
            onChange={(event) => setUniqueCode(event.target.value)}
            placeholder="شناسه یکتا"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'در حال استعلام...' : 'استعلام'}
        </button>
      </form>

      {error && <div className="reward-verify-feedback error">{error}</div>}

      {result && (
        <section className="reward-verify-result">
          <h2>نتیجه استعلام</h2>
          <div className="result-grid">
            <div>
              <span>منبع</span>
              <strong>{result.source || '-'}</strong>
            </div>
            <div>
              <span>کد رهگیری</span>
              <strong>{result.tracking_code}</strong>
            </div>
            <div>
              <span>مبلغ پاداش (ریال)</span>
              <strong>{result.reward_amount.toLocaleString('fa-IR')}</strong>
            </div>
            <div>
              <span>گزارش‌دهنده</span>
              <strong>{reporterName}</strong>
            </div>
            <div>
              <span>نام کاربری</span>
              <strong>{result.reporter.username}</strong>
            </div>
            <div>
              <span>کد ملی</span>
              <strong>{result.reporter.national_id}</strong>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default RewardVerification;
