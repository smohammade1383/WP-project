import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProtectedModule from '../components/ProtectedModule';
import { judgeApi, type JudgeCase } from '../services';
import './JudgePendingCases.css';

const severityLabelMap: Record<number, string> = {
  1: 'سطح ۳',
  2: 'سطح ۲',
  3: 'سطح ۱',
  4: 'بحرانی',
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    if ('data' in error) {
      const data = (error as { data?: unknown }).data;
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail.trim()) return detail;
      }
    }
  }
  return fallback;
};

const JudgePendingCases = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<JudgeCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingCaseId, setAcceptingCaseId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadPendingCases = async () => {
    try {
      setLoading(true);
      const data = await judgeApi.listPendingCases();
      setCases(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت پرونده‌های در انتظار پذیرش قاضی'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPendingCases();
  }, []);

  const handleAccept = async (caseId: number) => {
    try {
      setAcceptingCaseId(caseId);
      setError('');
      setSuccess('');
      await judgeApi.acceptCase(caseId);
      setSuccess(`پرونده #${caseId} با موفقیت پذیرفته شد.`);
      await loadPendingCases();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'پذیرش پرونده ناموفق بود.'));
    } finally {
      setAcceptingCaseId(null);
    }
  };

  return (
    <ProtectedModule moduleId="judge-case-acceptance">
      <div className="judge-pending-page">
        <header className="judge-pending-header">
          <div>
            <h1>پذیرش پرونده‌های دادگاه</h1>
            <p>پرونده‌هایی که وضعیت آن‌ها InCourt است و هنوز توسط قاضی پذیرفته نشده‌اند.</p>
          </div>
          <div className="judge-pending-actions">
            <button type="button" onClick={loadPendingCases} disabled={loading}>
              {loading ? '...' : 'بروزرسانی'}
            </button>
            <button type="button" className="secondary" onClick={() => navigate('/judge/bench')}>
              رفتن به میز قضاوت
            </button>
          </div>
        </header>

        {(error || success) && (
          <div className={`judge-pending-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        {loading ? (
          <div className="judge-pending-empty">در حال دریافت پرونده‌های در انتظار پذیرش...</div>
        ) : cases.length === 0 ? (
          <div className="judge-pending-empty">پرونده‌ای برای پذیرش جدید وجود ندارد.</div>
        ) : (
          <div className="judge-pending-grid">
            {cases.map((item) => (
              <article key={item.id} className="judge-pending-card">
                <div className="top">
                  <h2>
                    #{item.id} - {item.title}
                  </h2>
                  <span>{severityLabelMap[item.severity] || `سطح ${item.severity}`}</span>
                </div>
                <p className="meta">{item.location}</p>
                <p className="date">آخرین بروزرسانی: {formatDate(item.updated_at)}</p>
                <div className="actions">
                  <button
                    type="button"
                    onClick={() => handleAccept(item.id)}
                    disabled={acceptingCaseId === item.id}
                  >
                    {acceptingCaseId === item.id ? 'در حال پذیرش...' : 'قبول پرونده'}
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

export default JudgePendingCases;

