import { useEffect, useMemo, useState } from 'react';
import ProtectedModule from '../components/ProtectedModule';
import { rewardsApi, type RewardReport } from '../services';
import './DetectiveRewardsReview.css';

const statusLabelMap: Record<string, string> = {
  submitted: 'در انتظار افسر',
  officer_review: 'در انتظار افسر',
  detective_review: 'در بررسی کارآگاه',
  approved: 'تایید شده',
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

const reporterName = (item: RewardReport): string => {
  if (!item.reporter) return 'نامشخص';
  const fullName = `${item.reporter.first_name || ''} ${item.reporter.last_name || ''}`.trim();
  return fullName || item.reporter.username;
};

const DetectiveRewardsReview = () => {
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
      setError(getErrorMessage(err, 'خطا در دریافت صف تایید گزارش‌های مردمی'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const detectiveQueue = useMemo(() => {
    return reports
      .filter((item) => item.status === 'detective_review')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [reports]);

  const handleReview = async (reportId: number, action: 'approve' | 'reject') => {
    try {
      setSubmittingId(reportId);
      setError('');
      setSuccess('');
      const result = await rewardsApi.detectiveReview(reportId, { action });
      if (action === 'approve') {
        const issuedCode = result.tracking_code || result.unique_code || '-';
        setSuccess(
          `گزارش #${reportId} تایید شد. کد رهگیری ${issuedCode} صادر و مدرک به پرونده افزوده شد.`
        );
      } else {
        setSuccess(`گزارش #${reportId} رد شد.`);
      }
      await loadReports();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت تصمیم کارآگاه با خطا مواجه شد.'));
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
            <p>گزارش‌های مردمی ارجاع‌شده از افسر را تایید یا رد کنید.</p>
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
                  <span>پرونده: {item.case ? `#${item.case}` : '-'}</span>
                  <span>پروفایل مظنون: {item.suspect_profile ? `#${item.suspect_profile}` : '-'}</span>
                  <span>تاریخ ثبت: {formatDate(item.created_at)}</span>
                </div>
                <div className="detective-reward-actions">
                  <button
                    type="button"
                    className="reject-btn"
                    disabled={submittingId === item.id}
                    onClick={() => handleReview(item.id, 'reject')}
                  >
                    {submittingId === item.id ? 'در حال ثبت...' : 'رد گزارش'}
                  </button>
                  <button
                    type="button"
                    className="approve-btn"
                    disabled={submittingId === item.id}
                    onClick={() => handleReview(item.id, 'approve')}
                  >
                    {submittingId === item.id ? 'در حال ثبت...' : 'تایید و ثبت مدرک'}
                  </button>
                </div>
                <div className="detective-reward-note">
                  با تایید گزارش، به صورت خودکار یک مدرک «Informant Report» در پرونده ثبت می‌شود و کد رهگیری پاداش صادر می‌گردد.
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && reports.some((item) => item.status === 'approved') && (
          <section className="detective-approved-section">
            <h2>موارد تایید شده اخیر</h2>
            <div className="detective-approved-list">
              {reports
                .filter((item) => item.status === 'approved')
                .slice(0, 5)
                .map((item) => (
                  <div key={item.id} className="approved-row">
                    <span>#{item.id}</span>
                    <strong>{item.tracking_code || item.unique_code || '-'}</strong>
                    <span>{formatAmount(item.reward_amount)} ریال</span>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    </ProtectedModule>
  );
};

export default DetectiveRewardsReview;

