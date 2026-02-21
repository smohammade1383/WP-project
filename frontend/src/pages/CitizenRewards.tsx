import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { peopleApi, type CitizenTip } from '../services';
import './CitizenRewards.css';

const statusLabelMap: Record<string, string> = {
  officer_review: 'در بررسی افسر',
  detective_review: 'در بررسی کارآگاه',
  useful: 'مفید/تایید شده',
  approved: 'مفید/تایید شده',
  rejected: 'رد شده',
};

const statusClassMap: Record<string, string> = {
  officer_review: 'status-pending',
  detective_review: 'status-pending',
  useful: 'status-approved',
  approved: 'status-approved',
  rejected: 'status-rejected',
};

const formatDate = (value: string): string => {
  return new Date(value).toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatAmount = (value: number): string => {
  return value.toLocaleString('fa-IR');
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
};

const CitizenRewards = () => {
  const navigate = useNavigate();
  const [tips, setTips] = useState<CitizenTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTips = async () => {
    try {
      setLoading(true);
      const data = await peopleApi.listTips();
      setTips(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت وضعیت پاداش‌ها'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTips();
  }, []);

  const sortedTips = useMemo(() => {
    return [...tips].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [tips]);

  return (
    <div className="citizen-rewards-page">
      <div className="citizen-rewards-header">
        <div>
          <h1>وضعیت پاداش‌ها</h1>
          <p>وضعیت گزارش‌های مردمی ثبت‌شده و کد رهگیری پاداش را ببینید.</p>
        </div>
        <button type="button" className="new-report-btn" onClick={() => navigate('/most-wanted')}>
          ارسال گزارش جدید
        </button>
      </div>

      {error && <div className="rewards-feedback error">{error}</div>}

      {loading ? (
        <div className="rewards-loading">در حال بارگذاری گزارش‌ها...</div>
      ) : sortedTips.length === 0 ? (
        <div className="rewards-empty">
          <h3>گزارش پاداشی ثبت نشده است.</h3>
          <p>از صفحه «تحت پیگیری شدید» روی گزینه «ارسال گزارش» استفاده کنید.</p>
        </div>
      ) : (
        <div className="rewards-grid">
          {sortedTips.map((tip) => (
            <article key={tip.id} className="reward-card">
              <div className="reward-card-header">
                <h3>گزارش #{tip.id}</h3>
                <span className={`status-chip ${statusClassMap[tip.status] || ''}`}>
                  {statusLabelMap[tip.status] || tip.status}
                </span>
              </div>

              <p className="reward-description">{tip.description}</p>

              <div className="reward-meta">
                <div>
                  <span>پرونده</span>
                  <strong>{tip.case ? `#${tip.case}` : '-'}</strong>
                </div>
                <div>
                  <span>پروفایل مظنون</span>
                  <strong>{tip.suspect_profile ? `#${tip.suspect_profile}` : '-'}</strong>
                </div>
                <div>
                  <span>تاریخ ثبت</span>
                  <strong>{formatDate(tip.created_at)}</strong>
                </div>
              </div>

              <div className="reward-token">
                <span>کد رهگیری پاداش</span>
                <strong>
                  {tip.tracking_code?.trim() || tip.unique_tracking_code?.trim()
                    ? tip.tracking_code || tip.unique_tracking_code
                    : 'هنوز صادر نشده'}
                </strong>
              </div>

              <div className="reward-amount">
                <span>مبلغ پاداش (ریال)</span>
                <strong>{tip.reward_amount > 0 ? formatAmount(tip.reward_amount) : '—'}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default CitizenRewards;
