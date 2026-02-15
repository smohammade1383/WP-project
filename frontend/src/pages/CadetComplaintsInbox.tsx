import { useEffect, useMemo, useState } from 'react';
import { complaintsApi, type Complaint, type SecondaryComplainant } from '../services';
import './CadetComplaintsInbox.css';

const statusLabelMap: Record<string, string> = {
  submitted: 'در صف بررسی',
  returned: 'نیاز به اصلاح',
  approved: 'تایید شده',
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

const CadetComplaintsInbox = () => {
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [returnTarget, setReturnTarget] = useState<Complaint | null>(null);
  const [returnMessage, setReturnMessage] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [secondaryIdsInput, setSecondaryIdsInput] = useState('');
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [secondaryActionId, setSecondaryActionId] = useState<number | null>(null);

  const loadComplaints = async (): Promise<Complaint[]> => {
    try {
      setLoading(true);
      const data = await complaintsApi.list();
      setItems(data);
      setError('');
      return data;
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت شکایات دریافتی'));
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const newInboxItems = useMemo(() => {
    return items
      .filter((item) => item.status === 'submitted' && item.latest_review_decision !== 'approved')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [items]);

  const returnedFromOfficerItems = useMemo(() => {
    return items
      .filter((item) => item.status === 'returned' && item.latest_review_step === 'officer')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
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
      await complaintsApi.cadetReview(complaintId, { decision, message });
      setSuccess(
        decision === 'approved'
          ? `شکایت #${complaintId} تایید شد و برای افسر ارسال گردید.`
          : `شکایت #${complaintId} با پیام اصلاح برای شهروند بازگردانده شد.`
      );
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
            ? 'تایید شکایت با خطا مواجه شد.'
            : 'بازگردانی شکایت با خطا مواجه شد.'
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

  const handleReturnSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!returnTarget) return;
    const message = returnMessage.trim();
    if (!message) {
      setError('برای بازگرداندن شکایت، وارد کردن پیام اصلاح الزامی است.');
      return;
    }
    const isSuccessful = await submitDecision(returnTarget.id, 'returned', message);
    if (isSuccessful) {
      closeReturnModal();
    }
  };

  const parseUserIds = (raw: string): number[] => {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  };

  const syncSelectedComplaint = (updatedList: Complaint[]) => {
    if (!selectedComplaint) return;
    const matched = updatedList.find((item) => item.id === selectedComplaint.id) || null;
    setSelectedComplaint(matched);
  };

  const handleAddSecondaryComplainants = async () => {
    if (!selectedComplaint) return;
    const ids = parseUserIds(secondaryIdsInput);
    if (ids.length === 0) {
      setError('برای افزودن شاکیان فرعی، شناسه کاربری معتبر وارد کنید.');
      return;
    }

    try {
      setSecondaryLoading(true);
      setError('');
      setSuccess('');
      await complaintsApi.addComplainants(selectedComplaint.id, { complainant_ids: ids });
      setSecondaryIdsInput('');
      setSuccess('شاکیان فرعی اضافه شدند.');
      const updated = await loadComplaints();
      syncSelectedComplaint(updated);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'افزودن شاکیان فرعی با خطا مواجه شد.'));
    } finally {
      setSecondaryLoading(false);
    }
  };

  const handleReviewSecondary = async (
    entry: SecondaryComplainant,
    decision: 'approved' | 'rejected'
  ) => {
    if (!selectedComplaint) return;
    try {
      setSecondaryActionId(entry.id);
      setError('');
      setSuccess('');
      await complaintsApi.reviewSecondaryComplainant(selectedComplaint.id, entry.id, { decision });
      setSuccess(
        decision === 'approved'
          ? 'شاکی فرعی تایید شد.'
          : 'شاکی فرعی رد شد و از پرونده حذف گردید.'
      );
      const updated = await loadComplaints();
      syncSelectedComplaint(updated);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت نتیجه بررسی شاکی فرعی با خطا مواجه شد.'));
    } finally {
      setSecondaryActionId(null);
    }
  };

  const renderComplaintCard = (item: Complaint, type: 'new' | 'returned') => (
    <article key={item.id} className="cadet-complaint-card">
      <div className="cadet-card-header">
        <h3>
          #{item.id} - {item.title}
        </h3>
        <span className="cadet-status">{statusLabelMap[item.status] || item.status}</span>
      </div>

      <p className="cadet-description">{item.description}</p>

      <div className="cadet-meta">
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
          <span>بازگشت قبلی</span>
          <strong>{item.invalid_attempt_count} / 3</strong>
        </div>
      </div>

      {type === 'returned' && (
        <div className="cadet-officer-note">
          <span>ایراد اعلام‌شده توسط افسر:</span>
          <p>{item.latest_review_message?.trim() || 'پیامی ثبت نشده است.'}</p>
        </div>
      )}

      <div className="cadet-actions">
        <button type="button" className="details-btn" onClick={() => setSelectedComplaint(item)}>
          مشاهده جزئیات
        </button>
        <button
          type="button"
          className="approve-btn"
          onClick={() => handleApprove(item.id)}
          disabled={submittingId === item.id}
        >
          {submittingId === item.id ? 'در حال تایید...' : 'تایید و ارسال به افسر'}
        </button>
        <button
          type="button"
          className="return-btn"
          onClick={() => openReturnModal(item)}
          disabled={submittingId === item.id}
        >
          بازگردانی به شهروند
        </button>
      </div>
    </article>
  );

  return (
    <div className="cadet-complaints-page">
      <div className="cadet-complaints-header">
        <div>
          <h1>شکایات دریافتی</h1>
          <p>شکایات جدید شهروندان را بررسی کنید و برای افسر ارسال یا به شهروند بازگردانید.</p>
        </div>
        <div className="cadet-summary">
          <span>کل در صف: {newInboxItems.length + returnedFromOfficerItems.length}</span>
        </div>
      </div>

      {(error || success) && (
        <div className={`cadet-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
      )}

      {loading ? (
        <div className="cadet-loading">در حال بارگذاری شکایات...</div>
      ) : newInboxItems.length === 0 && returnedFromOfficerItems.length === 0 ? (
        <div className="cadet-empty">
          <h3>شکایت جدیدی برای بررسی وجود ندارد.</h3>
          <p>وقتی شهروند شکایت ثبت یا اصلاح کند، اینجا نمایش داده می‌شود.</p>
        </div>
      ) : (
        <>
          {returnedFromOfficerItems.length > 0 && (
            <section className="cadet-section">
              <div className="cadet-section-header">
                <h2>برگشتی از مافوق</h2>
                <span>{returnedFromOfficerItems.length} مورد</span>
              </div>
              <div className="cadet-complaints-grid">
                {returnedFromOfficerItems.map((item) => renderComplaintCard(item, 'returned'))}
              </div>
            </section>
          )}

          {newInboxItems.length > 0 && (
            <section className="cadet-section">
              <div className="cadet-section-header">
                <h2>شکایات جدید</h2>
                <span>{newInboxItems.length} مورد</span>
              </div>
              <div className="cadet-complaints-grid">
                {newInboxItems.map((item) => renderComplaintCard(item, 'new'))}
              </div>
            </section>
          )}
        </>
      )}

      {selectedComplaint && (
        <div className="cadet-modal-overlay" onClick={() => setSelectedComplaint(null)}>
          <div className="cadet-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cadet-modal-header">
              <h3>جزئیات شکایت #{selectedComplaint.id}</h3>
              <button type="button" onClick={() => setSelectedComplaint(null)} aria-label="بستن">
                ×
              </button>
            </div>

            <div className="cadet-modal-content">
              <div>
                <span>عنوان</span>
                <p>{selectedComplaint.title}</p>
              </div>
              <div>
                <span>شرح شکایت</span>
                <p>{selectedComplaint.description}</p>
              </div>
              <div>
                <span>ضمیمه‌ها</span>
                {selectedComplaint.attachments.length > 0 ? (
                  <ul className="cadet-attachment-list">
                    {selectedComplaint.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <a href={attachment.file} target="_blank" rel="noreferrer">
                          {attachment.original_name || `فایل #${attachment.id}`}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>مدرکی ضمیمه نشده است.</p>
                )}
              </div>
              <div>
                <span>مکان</span>
                <p>{selectedComplaint.location}</p>
              </div>
              <div>
                <span>زمان وقوع</span>
                <p>{formatDate(selectedComplaint.incident_datetime)}</p>
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
                <span>آخرین پیام بررسی</span>
                <p>{selectedComplaint.latest_review_message?.trim() || 'پیامی ثبت نشده است.'}</p>
              </div>

              <div className="cadet-secondary-section">
                <h4>شاکیان فرعی</h4>
                <p className="cadet-secondary-note">
                  هویت شاکیان دوم و سوم را در این بخش تایید یا رد کنید.
                </p>

                <div className="cadet-secondary-add">
                  <input
                    type="text"
                    value={secondaryIdsInput}
                    onChange={(event) => setSecondaryIdsInput(event.target.value)}
                    placeholder="افزودن با شناسه کاربری (مثال: 12, 18)"
                    disabled={secondaryLoading}
                  />
                  <button
                    type="button"
                    className="details-btn"
                    onClick={handleAddSecondaryComplainants}
                    disabled={secondaryLoading}
                  >
                    {secondaryLoading ? 'در حال افزودن...' : 'افزودن شاکی فرعی'}
                  </button>
                </div>

                {selectedComplaint.secondary_complainants.length === 0 ? (
                  <p className="cadet-secondary-empty">شاکی فرعی ثبت نشده است.</p>
                ) : (
                  <div className="cadet-secondary-list">
                    {selectedComplaint.secondary_complainants.map((entry) => (
                      <div key={entry.id} className="cadet-secondary-item">
                        <div className="cadet-secondary-main">
                          <strong>
                            {entry.user.first_name} {entry.user.last_name}
                          </strong>
                          <span>کد ملی: {entry.user.national_id}</span>
                        </div>
                        <div className="cadet-secondary-meta">
                          <span className={`cadet-secondary-status ${entry.status}`}>
                            {entry.status === 'pending'
                              ? 'در انتظار بررسی'
                              : entry.status === 'approved'
                                ? 'تایید شده'
                                : 'رد شده'}
                          </span>
                          {entry.review_message?.trim() && <span>{entry.review_message}</span>}
                        </div>
                        {entry.status === 'pending' && (
                          <div className="cadet-secondary-actions">
                            <button
                              type="button"
                              className="approve-btn"
                              disabled={secondaryActionId === entry.id}
                              onClick={() => handleReviewSecondary(entry, 'approved')}
                            >
                              تایید
                            </button>
                            <button
                              type="button"
                              className="return-btn"
                              disabled={secondaryActionId === entry.id}
                              onClick={() => handleReviewSecondary(entry, 'rejected')}
                            >
                              رد
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="cadet-modal-actions">
              <button
                type="button"
                className="approve-btn"
                onClick={() => handleApprove(selectedComplaint.id)}
                disabled={submittingId === selectedComplaint.id}
              >
                {submittingId === selectedComplaint.id ? 'در حال تایید...' : 'تایید'}
              </button>
              <button
                type="button"
                className="return-btn"
                onClick={() => openReturnModal(selectedComplaint)}
                disabled={submittingId === selectedComplaint.id}
              >
                بازگردانی
              </button>
            </div>
          </div>
        </div>
      )}

      {returnTarget && (
        <div className="cadet-modal-overlay" onClick={closeReturnModal}>
          <div className="cadet-modal cadet-return-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cadet-modal-header">
              <h3>بازگردانی شکایت #{returnTarget.id}</h3>
              <button type="button" onClick={closeReturnModal} aria-label="بستن">
                ×
              </button>
            </div>

            <form className="cadet-return-form" onSubmit={handleReturnSubmit}>
              <label htmlFor="return-message">پیام اصلاح برای شهروند</label>
              <textarea
                id="return-message"
                value={returnMessage}
                onChange={(event) => setReturnMessage(event.target.value)}
                rows={5}
                required
                placeholder="مثال: لطفاً زمان دقیق وقوع و اطلاعات تکمیلی شاهدان را وارد کنید."
              />

              <div className="cadet-modal-actions">
                <button type="button" className="details-btn" onClick={closeReturnModal}>
                  انصراف
                </button>
                <button type="submit" className="return-btn" disabled={submittingId === returnTarget.id}>
                  {submittingId === returnTarget.id ? 'در حال ارسال...' : 'ارسال بازگشت'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CadetComplaintsInbox;
