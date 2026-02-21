import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProtectedModule from '../components/ProtectedModule';
import { detectiveApi, type DetectiveCase } from '../services';
import './DetectivePendingCases.css';

const severityLabelMap: Record<number, string> = {
  1: 'سطح ۳',
  2: 'سطح ۲',
  3: 'سطح ۱',
  4: 'بحرانی',
};

const statusLabelMap: Record<string, string> = {
  Open: 'باز / در حال بررسی',
  WarrantPending: 'در انتظار تایید گروهبان',
  Arrested: 'بازداشت انجام شده',
  WaitingCaptain: 'در انتظار کاپیتان',
  WaitingChief: 'در انتظار رئیس پلیس',
  InCourt: 'ارسال به دادگاه',
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

const DetectivePendingCases = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<DetectiveCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingCaseId, setAcceptingCaseId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadPendingCases = async () => {
    try {
      setLoading(true);
      const data = await detectiveApi.listPendingCases();
      setCases(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت پرونده‌های در انتظار پذیرش'));
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
      await detectiveApi.acceptCase(caseId);
      setSuccess(`پرونده #${caseId} با موفقیت پذیرفته شد.`);
      await loadPendingCases();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'پذیرش پرونده ناموفق بود.'));
    } finally {
      setAcceptingCaseId(null);
    }
  };

  return (
    <ProtectedModule moduleId="detective-case-acceptance">
      <div className="detective-pending-page">
        <header className="detective-pending-header">
          <div>
            <h1>پذیرش پرونده‌های کارآگاه</h1>
            <p>پرونده‌هایی که هنوز کارآگاهی آن‌ها را قبول نکرده است.</p>
          </div>
          <div className="detective-pending-header-actions">
            <button type="button" onClick={loadPendingCases} disabled={loading}>
              {loading ? '...' : 'بروزرسانی'}
            </button>
            <button type="button" className="secondary" onClick={() => navigate('/detective/cases')}>
              رفتن به پرونده‌های من
            </button>
          </div>
        </header>

        {(error || success) && (
          <div className={`detective-pending-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        {loading ? (
          <div className="detective-pending-empty">در حال دریافت پرونده‌های در انتظار پذیرش...</div>
        ) : cases.length === 0 ? (
          <div className="detective-pending-empty">پرونده‌ای برای پذیرش جدید وجود ندارد.</div>
        ) : (
          <div className="detective-pending-grid">
            {cases.map((item) => (
              <article key={item.id} className="detective-pending-card-v2">
                <div className="top">
                  <h2>
                    #{item.id} - {item.title}
                  </h2>
                  <span>{statusLabelMap[item.status] || item.status}</span>
                </div>
                <p className="meta">
                  <strong>{severityLabelMap[item.severity] || `سطح ${item.severity}`}</strong>
                  <span>{item.location}</span>
                </p>
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

export default DetectivePendingCases;

