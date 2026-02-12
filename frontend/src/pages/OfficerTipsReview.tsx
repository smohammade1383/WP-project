import { useEffect, useMemo, useState } from 'react';
import ProtectedModule from '../components/ProtectedModule';
import { rewardsApi, type RewardReport } from '../services';
import './OfficerTipsReview.css';

const statusLabelMap: Record<string, string> = {
  submitted: 'در انتظار بررسی افسر',
  officer_review: 'در انتظار بررسی افسر',
  detective_review: 'ارجاع شده به کارآگاه',
  approved: 'تایید نهایی',
  rejected: 'رد شده',
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

const formatDate = (value: string): string => {
  return new Date(value).toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getReporterName = (item: RewardReport): string => {
  if (!item.reporter) return 'نامشخص';
  const fullName = `${item.reporter.first_name || ''} ${item.reporter.last_name || ''}`.trim();
  return fullName || item.reporter.username;
};

const OfficerTipsReview = () => {
  const [reports, setReports] = useState<RewardReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await rewardsApi.list();
      setReports(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت گزارش‌های مردمی'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const pendingReports = useMemo(() => {
    return reports
      .filter((item) => item.status === 'submitted' || item.status === 'officer_review')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [reports]);

  const handleReview = async (reportId: number, action: 'forward' | 'reject') => {
    try {
      setSubmittingId(reportId);
      setError('');
      setSuccess('');
      await rewardsApi.officerReview(reportId, { action });
      setSuccess(
        action === 'forward'
          ? `گزارش #${reportId} برای کارآگاه ارجاع شد.`
          : `گزارش #${reportId} به عنوان اسپم/نامعتبر رد شد.`
      );
      await loadReports();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت نتیجه بررسی گزارش با خطا مواجه شد.'));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <ProtectedModule moduleId="officer-tips">
      <div className="officer-tips-page">
        <div className="officer-tips-header">
          <div>
            <h1>گزارش‌های مردمی</h1>
            <p>گزارش‌های دریافتی درباره مظنونین تحت تعقیب را بررسی کنید.</p>
          </div>
          <div className="tips-summary">در انتظار بررسی: {pendingReports.length}</div>
        </div>

        {(error || success) && (
          <div className={`tips-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        {loading ? (
          <div className="tips-loading">در حال بارگذاری گزارش‌ها...</div>
        ) : pendingReports.length === 0 ? (
          <div className="tips-empty">
            <h3>گزارش جدیدی برای بررسی وجود ندارد.</h3>
            <p>وقتی شهروند گزارش جدید ثبت کند، در این بخش نمایش داده می‌شود.</p>
          </div>
        ) : (
          <div className="tips-grid">
            {pendingReports.map((item) => (
              <article key={item.id} className="tip-card">
                <div className="tip-card-header">
                  <h3>گزارش #{item.id}</h3>
                  <span className="tip-status">{statusLabelMap[item.status] || item.status}</span>
                </div>

                <p className="tip-description">{item.description}</p>

                <div className="tip-meta">
                  <div>
                    <span>گزارش‌دهنده</span>
                    <strong>{getReporterName(item)}</strong>
                  </div>
                  <div>
                    <span>کد ملی</span>
                    <strong>{item.reporter?.national_id || '-'}</strong>
                  </div>
                  <div>
                    <span>پرونده</span>
                    <strong>{item.case ? `#${item.case}` : '-'}</strong>
                  </div>
                  <div>
                    <span>پروفایل مظنون</span>
                    <strong>{item.suspect_profile ? `#${item.suspect_profile}` : '-'}</strong>
                  </div>
                  <div>
                    <span>تاریخ ثبت</span>
                    <strong>{formatDate(item.created_at)}</strong>
                  </div>
                </div>

                <div className="tip-actions">
                  <button
                    type="button"
                    className="tip-reject-btn"
                    onClick={() => handleReview(item.id, 'reject')}
                    disabled={submittingId === item.id}
                  >
                    {submittingId === item.id ? 'در حال ثبت...' : 'رد کردن (Spam)'}
                  </button>
                  <button
                    type="button"
                    className="tip-forward-btn"
                    onClick={() => handleReview(item.id, 'forward')}
                    disabled={submittingId === item.id}
                  >
                    {submittingId === item.id ? 'در حال ثبت...' : 'ارجاع به کارآگاه'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </ProtectedModule>
  );
};

export default OfficerTipsReview;
