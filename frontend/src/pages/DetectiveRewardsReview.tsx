import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProtectedModule from '../components/ProtectedModule';
import { peopleApi, type CitizenTip } from '../services';
import './DetectiveRewardsReview.css';

const statusLabelMap: Record<string, string> = {
  officer_review: 'در انتظار افسر',
  detective_review: 'در بررسی کارآگاه',
  useful: 'مفید / نهایی',
  approved: 'مفید / نهایی',
  rejected: 'رد شده',
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

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
};

const reporterName = (item: CitizenTip): string => {
  const fullName = `${item.reporter.first_name || ''} ${item.reporter.last_name || ''}`.trim();
  return fullName || item.reporter.username;
};

const DetectiveRewardsReview = () => {
  const navigate = useNavigate();
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
      setError(getErrorMessage(err, 'خطا در دریافت صف تایید گزارش‌های مردمی'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTips();
  }, []);

  const detectiveQueue = useMemo(() => {
    return tips
      .filter((item) => item.status === 'detective_review')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [tips]);

  const handleReject = async (tipId: number) => {
    try {
      setSubmittingId(tipId);
      setError('');
      setSuccess('');
      await peopleApi.detectiveReviewTip(tipId, { approved: false });
      setSuccess(`گزارش #${tipId} رد شد.`);
      await loadTips();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت تصمیم کارآگاه با خطا مواجه شد.'));
    } finally {
      setSubmittingId(null);
    }
  };

  const handleLinkToCase = async (tip: CitizenTip) => {
    const caseId = Number(tip.case ?? tip.suspect_profile_case_id ?? 0);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      setError('این گزارش هنوز پرونده هدف معتبر ندارد. ابتدا پرونده/کارآگاه پرونده را تعیین کنید.');
      return;
    }

    try {
      setSubmittingId(tip.id);
      setError('');
      setSuccess('');
      const result = await peopleApi.detectiveLinkTipToCase(tip.id, { case_id: caseId });
      const code = result.tracking_code || result.unique_tracking_code || '-';
      setSuccess(`گزارش #${tip.id} به پرونده #${caseId} لینک شد. کد رهگیری ${code} صادر شد.`);
      await loadTips();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'لینک کردن گزارش به پرونده ناموفق بود.'));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <ProtectedModule moduleId="detective-rewards">
      <div className="detective-rewards-page">
        <header className="detective-rewards-header">
          <div>
            <h1>تاییدیه پاداش</h1>
            <p>گزارش‌های مردمی ارجاع‌شده از افسر را بررسی و به پرونده لینک کنید.</p>
          </div>
          <span className="queue-count">در صف کارآگاه: {detectiveQueue.length}</span>
        </header>

        {(error || success) && (
          <div className={`detective-rewards-feedback ${error ? 'error' : 'success'}`}>
            {error || success}
          </div>
        )}

        {loading ? (
          <div className="detective-rewards-empty">در حال بارگذاری گزارش‌ها...</div>
        ) : detectiveQueue.length === 0 ? (
          <div className="detective-rewards-empty">
            در حال حاضر گزارشی در صف تایید کارآگاه وجود ندارد.
          </div>
        ) : (
          <div className="detective-rewards-grid">
            {detectiveQueue.map((item) => (
              <article key={item.id} className="detective-reward-card">
                <div className="detective-reward-head">
                  <h3>گزارش #{item.id}</h3>
                  <span className="status-chip">{statusLabelMap[item.status] || item.status}</span>
                </div>
                <p>{item.description}</p>
                <div className="detective-reward-meta">
                  <span>گزارش‌دهنده: {reporterName(item)}</span>
                  <span>کد ملی: {item.reporter?.national_id || '-'}</span>
                  <span>پرونده هدف: {item.case || item.suspect_profile_case_id ? `#${item.case || item.suspect_profile_case_id}` : '-'}</span>
                  <span>پروفایل مظنون: {item.suspect_profile ? `#${item.suspect_profile}` : '-'}</span>
                  <span>تاریخ ثبت: {formatDate(item.created_at)}</span>
                </div>

                <div className="detective-reward-actions">
                  <button
                    type="button"
                    className="reject-btn"
                    disabled={submittingId === item.id}
                    onClick={() => handleReject(item.id)}
                  >
                    {submittingId === item.id ? 'در حال ثبت...' : 'رد گزارش'}
                  </button>
                  <button
                    type="button"
                    className="approve-btn"
                    disabled={submittingId === item.id}
                    onClick={() => handleLinkToCase(item)}
                  >
                    {submittingId === item.id ? 'در حال ثبت...' : 'Link to Case'}
                  </button>
                </div>
                <div className="detective-reward-note">
                  با لینک کردن گزارش به پرونده، یک مدرک «Citizen Tip» ثبت می‌شود و وضعیت گزارش به USEFUL تغییر می‌کند.
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && tips.some((item) => item.status === 'useful' || item.status === 'approved') && (
          <section className="detective-approved-section">
            <h2>موارد مفید اخیر</h2>
            <div className="detective-approved-list">
              {tips
                .filter((item) => item.status === 'useful' || item.status === 'approved')
                .slice(0, 5)
                .map((item) => (
                  <div key={item.id} className="approved-row">
                    <span>#{item.id}</span>
                    <strong>تایید شده</strong>
                    <span>برای استعلام مبلغ از فرم کد ملی + شناسه یکتا استفاده کنید.</span>
                  </div>
                ))}
            </div>
            <button
              type="button"
              className="approve-btn"
              onClick={() => navigate('/rewards/verify')}
              style={{ marginTop: '0.75rem' }}
            >
              رفتن به فرم استعلام پاداش
            </button>
          </section>
        )}
      </div>
    </ProtectedModule>
  );
};

export default DetectiveRewardsReview;
