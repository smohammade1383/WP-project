import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rewardsApi, type RewardReport } from '../services';
import './CitizenRewards.css';

const statusLabelMap: Record<string, string> = {
  submitted: 'ثبت شده',
  officer_review: 'در بررسی افسر',
  detective_review: 'در بررسی کارآگاه',
  approved: 'تایید شده',
  rejected: 'رد شده',
};

const statusClassMap: Record<string, string> = {
  submitted: 'status-submitted',
  officer_review: 'status-pending',
  detective_review: 'status-pending',
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
  const [reports, setReports] = useState<RewardReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await rewardsApi.listMine();
      setReports(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت وضعیت پاداش‌ها'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const sortedReports = useMemo(() => {
    return [...reports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [reports]);

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
      ) : sortedReports.length === 0 ? (
        <div className="rewards-empty">
          <h3>گزارش پاداشی ثبت نشده است.</h3>
          <p>از صفحه «تحت پیگیری شدید» روی گزینه «ارسال گزارش» استفاده کنید.</p>
        </div>
      ) : (
        <div className="rewards-grid">
          {sortedReports.map((report) => (
            <article key={report.id} className="reward-card">
              <div className="reward-card-header">
                <h3>گزارش #{report.id}</h3>
                <span className={`status-chip ${statusClassMap[report.status] || ''}`}>
                  {statusLabelMap[report.status] || report.status}
                </span>
              </div>

              <p className="reward-description">{report.description}</p>

              <div className="reward-meta">
                <div>
                  <span>پرونده</span>
                  <strong>{report.case ? `#${report.case}` : '-'}</strong>
                </div>
                <div>
                  <span>پروفایل مظنون</span>
                  <strong>{report.suspect_profile ? `#${report.suspect_profile}` : '-'}</strong>
                </div>
                <div>
                  <span>تاریخ ثبت</span>
                  <strong>{formatDate(report.created_at)}</strong>
                </div>
              </div>

              <div className="reward-token">
                <span>کد رهگیری پاداش</span>
                <strong>{report.unique_code?.trim() ? report.unique_code : 'هنوز صادر نشده'}</strong>
              </div>

              <div className="reward-amount">
                <span>مبلغ پاداش (ریال)</span>
                <strong>{report.reward_amount > 0 ? formatAmount(report.reward_amount) : '—'}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default CitizenRewards;
