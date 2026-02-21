import { useEffect, useMemo, useState } from 'react';
import ProtectedModule from '../components/ProtectedModule';
import { peopleApi, type CitizenTip } from '../services';
import './OfficerTipsReview.css';

const statusLabelMap: Record<string, string> = {
  officer_review: 'در انتظار بررسی افسر',
  detective_review: 'ارجاع شده به کارآگاه',
  useful: 'مفید/تایید نهایی',
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

const getReporterName = (item: CitizenTip): string => {
  const fullName = `${item.reporter.first_name || ''} ${item.reporter.last_name || ''}`.trim();
  return fullName || item.reporter.username;
};

const OfficerTipsReview = () => {
  const [tips, setTips] = useState<CitizenTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadTips = async () => {
    try {
      setLoading(true);
      const data = await peopleApi.listTips();
      setTips(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت گزارش‌های مردمی'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTips();
  }, []);

  const pendingTips = useMemo(() => {
    return tips
      .filter((item) => item.status === 'officer_review')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [tips]);

  const handleReview = async (tipId: number, approved: boolean) => {
    try {
      setSubmittingId(tipId);
      setError('');
      setSuccess('');
      await peopleApi.officerReviewTip(tipId, { approved });
      setSuccess(
        approved
          ? `گزارش #${tipId} برای کارآگاه ارجاع شد.`
          : `گزارش #${tipId} به عنوان نامعتبر رد شد.`
      );
      await loadTips();
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
          <div className="tips-summary">در انتظار بررسی: {pendingTips.length}</div>
        </div>

        {(error || success) && (
          <div className={`tips-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        {loading ? (
          <div className="tips-loading">در حال بارگذاری گزارش‌ها...</div>
        ) : pendingTips.length === 0 ? (
          <div className="tips-empty">
            <h3>گزارش جدیدی برای بررسی وجود ندارد.</h3>
            <p>وقتی شهروند گزارش جدید ثبت کند، در این بخش نمایش داده می‌شود.</p>
          </div>
        ) : (
          <div className="tips-grid">
            {pendingTips.map((item) => (
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
                    <span>پرونده لینک شده</span>
                    <strong>{item.case ? `#${item.case}` : '—'}</strong>
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
                    onClick={() => handleReview(item.id, false)}
                    disabled={submittingId === item.id}
                  >
                    {submittingId === item.id ? 'در حال ثبت...' : 'رد کردن (Spam)'}
                  </button>
                  <button
                    type="button"
                    className="tip-forward-btn"
                    onClick={() => handleReview(item.id, true)}
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
