import { useEffect, useMemo, useState } from 'react';
import { paymentsApi, type PaymentTransaction } from '../services';
import './LegalBailStatus.css';

const formatAmount = (value: number): string => value.toLocaleString('fa-IR');
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const API_ORIGIN = new URL(API_BASE_URL).origin;

const toAbsoluteUrl = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return new URL(url, API_ORIGIN).toString();
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

const txTypeLabelMap: Record<string, string> = {
  bail: 'وثیقه',
  fine: 'جریمه',
  reward: 'پاداش',
};

const computeLegalStatus = (tx: PaymentTransaction): 'FREE' | 'DETAINED' | 'PENDING_BAIL' => {
  if (tx.status === 'paid') return 'FREE';
  if (tx.suspect_is_arrested && tx.status === 'initiated') return 'PENDING_BAIL';
  if (tx.suspect_is_arrested) return 'DETAINED';
  return 'FREE';
};

const legalStatusLabelMap: Record<string, string> = {
  FREE: 'آزاد',
  DETAINED: 'بازداشت',
  PENDING_BAIL: 'منتظر وثیقه',
};

const txStatusLabelMap: Record<string, string> = {
  initiated: 'در انتظار پرداخت',
  paid: 'پرداخت‌شده',
  failed: 'ناموفق',
};

const LegalBailStatus = () => {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [startingId, setStartingId] = useState<number | null>(null);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await paymentsApi.list();
      setTransactions(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت وضعیت وثیقه و جریمه'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const tx = params.get('tx');
    const refId = params.get('ref_id');
    const reason = params.get('reason');
    if (payment === 'success') {
      setSuccess(
        `پرداخت با موفقیت ثبت شد${tx ? ` (تراکنش #${tx})` : ''}${refId ? ` - کد رهگیری ${refId}` : ''}.`
      );
      setError('');
    } else if (payment === 'failed') {
      setError(`پرداخت ناموفق بود${tx ? ` (تراکنش #${tx})` : ''}${reason ? ` - ${reason}` : ''}.`);
      setSuccess('');
    }
  }, []);

  const bailTransactions = useMemo(() => {
    return transactions
      .filter((item) => item.transaction_type === 'bail' || item.transaction_type === 'fine')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [transactions]);

  const handleStartPayment = async (transactionId: number) => {
    try {
      setStartingId(transactionId);
      setError('');
      setSuccess('');
      const tx = transactions.find((item) => item.id === transactionId);
      if (!tx || !tx.suspect_profile) {
        setError('برای این تراکنش اطلاعات مظنون در دسترس نیست.');
        return;
      }

      const result = await paymentsApi.requestBail({
        suspect_profile: tx.suspect_profile,
        amount: tx.amount,
        description: `Bail payment for transaction #${transactionId}`,
      });

      const target = result.start_url
        ? toAbsoluteUrl(result.start_url)
        : `https://sandbox.zarinpal.com/pg/StartPay/${result.authority}`;
      setSuccess(`در حال انتقال به درگاه ZarinPal برای تراکنش #${transactionId} ...`);
      window.location.href = target;
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'شروع پرداخت آنلاین با خطا مواجه شد.'));
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="legal-bail-page">
      <div className="legal-bail-header">
        <h1>وضعیت حقوقی و وثیقه</h1>
        <p>وضعیت بازداشت/آزادی، مبلغ وثیقه یا جریمه، و امکان پرداخت آنلاین را مشاهده کنید.</p>
      </div>

      {(error || success) && (
        <div className={`legal-bail-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
      )}

      {loading ? (
        <div className="legal-bail-loading">در حال بارگذاری اطلاعات مالی...</div>
      ) : bailTransactions.length === 0 ? (
        <div className="legal-bail-empty">
          <h3>تراکنش وثیقه یا جریمه‌ای ثبت نشده است.</h3>
          <p>بعد از تعیین مبلغ توسط گروهبان، جزئیات در این بخش نمایش داده می‌شود.</p>
        </div>
      ) : (
        <div className="legal-bail-grid">
          {bailTransactions.map((tx) => {
            const legalStatus = computeLegalStatus(tx);
            const canPay = tx.status === 'initiated';
            return (
              <article key={tx.id} className="legal-bail-card">
                <div className="legal-bail-card-header">
                  <h3>تراکنش #{tx.id}</h3>
                  <span className={`legal-state-badge ${legalStatus.toLowerCase()}`}>
                    {legalStatusLabelMap[legalStatus]}
                  </span>
                </div>

                <div className="legal-bail-meta">
                  <div>
                    <span>نوع</span>
                    <strong>{txTypeLabelMap[tx.transaction_type] || tx.transaction_type}</strong>
                  </div>
                  <div>
                    <span>مبلغ تعیین‌شده (ریال)</span>
                    <strong>{formatAmount(tx.amount)}</strong>
                  </div>
                  <div>
                    <span>وضعیت پرداخت</span>
                    <strong>{txStatusLabelMap[tx.status] || tx.status}</strong>
                  </div>
                  <div>
                    <span>پرونده</span>
                    <strong>{tx.case ? `#${tx.case}` : '-'}</strong>
                  </div>
                </div>

                <div className="legal-bail-actions">
                  {canPay ? (
                    <button
                      type="button"
                      className="pay-btn"
                      onClick={() => handleStartPayment(tx.id)}
                      disabled={startingId === tx.id}
                    >
                      {startingId === tx.id ? 'در حال اتصال...' : 'پرداخت آنلاین'}
                    </button>
                  ) : (
                    <span className="pay-note">این تراکنش قابل پرداخت نیست.</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LegalBailStatus;
