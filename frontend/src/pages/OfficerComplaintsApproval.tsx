import { useEffect, useMemo, useState } from 'react';
import { complaintsApi, type Complaint } from '../services';
import './OfficerComplaintsApproval.css';

const statusLabelMap: Record<string, string> = {
  submitted: 'در انتظار تایید افسر',
  returned: 'برگشتی',
  approved: 'تایید نهایی',
  rejected: 'رد شده',
  void: 'باطل شده',
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

const OfficerComplaintsApproval = () => {
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [returnTarget, setReturnTarget] = useState<Complaint | null>(null);
  const [returnMessage, setReturnMessage] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const loadComplaints = async () => {
    try {
      setLoading(true);
      const data = await complaintsApi.list();
      setItems(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت شکایات قابل تایید'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const queueItems = useMemo(() => {
    return items
      .filter(
        (item) =>
          item.status === 'submitted' &&
          item.latest_review_step === 'cadet' &&
          item.latest_review_decision === 'approved'
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [items]);

  const submitDecision = async (
    complaintId: number,
    decision: 'approved' | 'returned',
    message = ''
  ): Promise<boolean> => {
    try {
      setSubmittingId(complaintId);
      setError('');
      setSuccess('');
      const response = await complaintsApi.officerReview(complaintId, { decision, message });

      if (decision === 'approved') {
        setSuccess(
          response.case?.id
            ? `شکایت #${complaintId} تایید شد و پرونده #${response.case.id} تشکیل گردید.`
            : `شکایت #${complaintId} تایید شد و پرونده تشکیل شد.`
        );
      } else {
        setSuccess(`شکایت #${complaintId} برای بررسی مجدد به کارآموز ارجاع شد.`);
      }

      if (selectedComplaint?.id === complaintId) {
        setSelectedComplaint(null);
      }

      await loadComplaints();
      return true;
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          decision === 'approved'
            ? 'تایید نهایی شکایت با خطا مواجه شد.'
            : 'ارجاع به کارآموز با خطا مواجه شد.'
        )
      );
      return false;
    } finally {
      setSubmittingId(null);
    }
  };

  const handleApprove = async (complaintId: number) => {
    await submitDecision(complaintId, 'approved');
  };

  const openReturnModal = (item: Complaint) => {
    setReturnTarget(item);
    setReturnMessage('');
  };

  const closeReturnModal = () => {
    setReturnTarget(null);
    setReturnMessage('');
  };

  const handleReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!returnTarget) return;
    const message = returnMessage.trim();
    if (!message) {
      setError('برای ارجاع به کارآموز، ثبت پیام اصلاح الزامی است.');
      return;
    }

    const isSuccessful = await submitDecision(returnTarget.id, 'returned', message);
    if (isSuccessful) {
      closeReturnModal();
    }
  };

  return (
    <div className="officer-complaints-page">
      <div className="officer-complaints-header">
        <div>
          <h1>تایید نهایی شکایات</h1>
          <p>شکایات تایید شده توسط کارآموز را بررسی کرده و پرونده را تشکیل دهید.</p>
        </div>
        <div className="officer-summary">
          <span>در صف افسر: {queueItems.length}</span>
        </div>
      </div>

      {(error || success) && (
        <div className={`officer-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
      )}

      {loading ? (
        <div className="officer-loading">در حال بارگذاری شکایات...</div>
      ) : queueItems.length === 0 ? (
        <div className="officer-empty">
          <h3>شکایتی برای تایید نهایی وجود ندارد.</h3>
          <p>پس از تایید کارآموز، شکایت‌ها در این بخش نمایش داده می‌شوند.</p>
        </div>
      ) : (
        <div className="officer-complaints-grid">
          {queueItems.map((item) => (
            <article key={item.id} className="officer-complaint-card">
              <div className="officer-card-header">
                <h3>
                  #{item.id} - {item.title}
                </h3>
                <span className="officer-status">{statusLabelMap[item.status] || item.status}</span>
              </div>

              <p className="officer-description">{item.description}</p>

              <div className="officer-meta">
                <div>
                  <span>ثبت‌کننده</span>
                  <strong>
                    {item.submitter?.first_name} {item.submitter?.last_name}
                  </strong>
                </div>
                <div>
                  <span>مکان</span>
                  <strong>{item.location}</strong>
                </div>
                <div>
                  <span>زمان وقوع</span>
                  <strong>{formatDate(item.incident_datetime)}</strong>
                </div>
                <div>
                  <span>تعداد خطا</span>
                  <strong>{item.invalid_attempt_count} / 3</strong>
                </div>
              </div>

              <div className="officer-actions">
                <button type="button" className="details-btn" onClick={() => setSelectedComplaint(item)}>
                  مشاهده جزئیات
                </button>
                <button
                  type="button"
                  className="approve-btn"
                  onClick={() => handleApprove(item.id)}
                  disabled={submittingId === item.id}
                >
                  {submittingId === item.id ? 'در حال تشکیل پرونده...' : 'تایید و تشکیل پرونده'}
                </button>
                <button
                  type="button"
                  className="return-btn"
                  onClick={() => openReturnModal(item)}
                  disabled={submittingId === item.id}
                >
                  ارجاع مجدد به کارآموز
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedComplaint && (
        <div className="officer-modal-overlay" onClick={() => setSelectedComplaint(null)}>
          <div className="officer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="officer-modal-header">
              <h3>جزئیات شکایت #{selectedComplaint.id}</h3>
              <button type="button" onClick={() => setSelectedComplaint(null)} aria-label="بستن">
                ×
              </button>
            </div>

            <div className="officer-modal-content">
              <div>
                <span>عنوان</span>
                <p>{selectedComplaint.title}</p>
              </div>
              <div>
                <span>شرح شکایت</span>
                <p>{selectedComplaint.description}</p>
              </div>
              <div>
                <span>شاکی‌ها</span>
                <p>
                  {selectedComplaint.complainants.length > 0
                    ? selectedComplaint.complainants
                        .map((user) => `${user.first_name} ${user.last_name}`.trim() || user.username)
                        .join('، ')
                    : 'بدون شاکی ثبت‌شده'}
                </p>
              </div>
              <div>
                <span>آخرین نظر کارآموز</span>
                <p>{selectedComplaint.latest_review_message?.trim() || 'پیامی ثبت نشده است.'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {returnTarget && (
        <div className="officer-modal-overlay" onClick={closeReturnModal}>
          <div className="officer-modal" onClick={(event) => event.stopPropagation()}>
            <div className="officer-modal-header">
              <h3>ارجاع شکایت #{returnTarget.id} به کارآموز</h3>
              <button type="button" onClick={closeReturnModal} aria-label="بستن">
                ×
              </button>
            </div>
            <form className="officer-return-form" onSubmit={handleReturn}>
              <label htmlFor="officer-return-message">توضیح نقص پرونده</label>
              <textarea
                id="officer-return-message"
                value={returnMessage}
                onChange={(event) => setReturnMessage(event.target.value)}
                rows={5}
                required
                placeholder="مثال: محل وقوع و مشخصات یکی از شاهدان نیاز به تکمیل دارد."
              />
              <div className="officer-modal-actions">
                <button type="button" className="details-btn" onClick={closeReturnModal}>
                  انصراف
                </button>
                <button type="submit" className="return-btn" disabled={submittingId === returnTarget.id}>
                  {submittingId === returnTarget.id ? 'در حال ارسال...' : 'ارسال به کارآموز'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficerComplaintsApproval;
