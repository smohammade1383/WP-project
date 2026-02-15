import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import ProtectedModule from '../components/ProtectedModule';
import { rewardsApi } from '../services';
import './RewardVerification.css';

type VerificationResult = {
  report_id: number;
  tracking_code: string;
  reward_amount: number;
  reporter: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    national_id: string;
  };
};

const formatAmount = (value: number): string => value.toLocaleString('fa-IR');

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
  const [nationalId, setNationalId] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);

  const reporterDisplayName = useMemo(() => {
    if (!result) return '';
    const fullName = `${result.reporter.first_name || ''} ${result.reporter.last_name || ''}`.trim();
    return fullName || result.reporter.username;
  }, [result]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedNationalId = nationalId.trim();
    const normalizedCode = trackingCode.trim();

    if (!/^\d{10}$/.test(normalizedNationalId)) {
      setError('کد ملی باید دقیقا ۱۰ رقم باشد.');
      return;
    }
    if (!normalizedCode) {
      setError('کد رهگیری/شناسه یکتا را وارد کنید.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await rewardsApi.verifyByCode({
        national_id: normalizedNationalId,
        tracking_code: normalizedCode,
      });
      setResult(response);
    } catch (err: unknown) {
      setResult(null);
      setError(getErrorMessage(err, 'استعلام پاداش با خطا مواجه شد.'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setNationalId('');
    setTrackingCode('');
    setResult(null);
    setError('');
  };

  return (
    <ProtectedModule moduleId="reward-verification">
      <div className="reward-verification-page">
        <header className="reward-verification-header">
          <div>
            <h1>استعلام پاداش مردمی</h1>
            <p>
              با وارد کردن کد ملی گزارش‌دهنده و کد رهگیری/شناسه یکتا، مبلغ پاداش قابل پرداخت را
              مشاهده کنید.
            </p>
          </div>
        </header>

        <section className="reward-verification-card">
          <form className="reward-verification-form" onSubmit={handleSubmit}>
            <label htmlFor="national-id">
              کد ملی گزارش‌دهنده
              <input
                id="national-id"
                type="text"
                inputMode="numeric"
                placeholder="مثال: 0012345678"
                value={nationalId}
                onChange={(event) => setNationalId(event.target.value)}
                maxLength={10}
              />
            </label>

            <label htmlFor="tracking-code">
              کد رهگیری / شناسه یکتا
              <input
                id="tracking-code"
                type="text"
                placeholder="کد صادر شده برای پاداش"
                value={trackingCode}
                onChange={(event) => setTrackingCode(event.target.value.toUpperCase())}
              />
            </label>

            <div className="reward-verification-actions">
              <button type="submit" disabled={loading}>
                {loading ? 'در حال استعلام...' : 'استعلام پاداش'}
              </button>
              <button type="button" className="secondary" onClick={handleReset} disabled={loading}>
                پاک‌سازی
              </button>
            </div>
          </form>

          {error && <div className="reward-verification-feedback error">{error}</div>}

          {result && (
            <div className="reward-verification-result">
              <h2>نتیجه استعلام</h2>
              <div className="result-grid">
                <div>
                  <span>شناسه گزارش</span>
                  <strong>#{result.report_id}</strong>
                </div>
                <div>
                  <span>گزارش‌دهنده</span>
                  <strong>{reporterDisplayName}</strong>
                </div>
                <div>
                  <span>کد ملی</span>
                  <strong>{result.reporter.national_id}</strong>
                </div>
                <div>
                  <span>کد رهگیری</span>
                  <strong>{result.tracking_code}</strong>
                </div>
              </div>
              <div className="result-amount">
                <span>مبلغ قابل پرداخت</span>
                <strong>{formatAmount(result.reward_amount)} ریال</strong>
              </div>
            </div>
          )}
        </section>
      </div>
    </ProtectedModule>
  );
};

export default RewardVerification;
