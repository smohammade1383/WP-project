import { useEffect, useMemo, useState } from 'react';
import { coronerApi, type EvidenceRecord } from '../services';
import ProtectedModule from '../components/ProtectedModule';
import './CoronerLab.css';

type LabFilter = 'pending' | 'accepted' | 'rejected' | 'all';

const statusLabelMap: Record<string, string> = {
  pending: 'منتظر آزمایش',
  accepted: 'تایید شده',
  rejected: 'رد شده',
};

const formatDate = (value: string): string =>
  new Date(value).toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
};

const getValidationStatus = (item: EvidenceRecord): 'pending' | 'accepted' | 'rejected' => {
  const status = (item.details as { validation_status?: unknown }).validation_status;
  if (status === 'accepted' || status === 'rejected' || status === 'pending') {
    return status;
  }
  return 'pending';
};

const CoronerLab = () => {
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState<LabFilter>('pending');

  const [selectedItem, setSelectedItem] = useState<EvidenceRecord | null>(null);
  const [labResult, setLabResult] = useState('');
  const [followup, setFollowup] = useState('');
  const [decision, setDecision] = useState<'accepted' | 'rejected'>('accepted');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await coronerApi.listBioEvidence();
      setItems(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت مدارک زیستی'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => getValidationStatus(item) === filter);
  }, [items, filter]);

  const counts = useMemo(
    () => ({
      pending: items.filter((item) => getValidationStatus(item) === 'pending').length,
      accepted: items.filter((item) => getValidationStatus(item) === 'accepted').length,
      rejected: items.filter((item) => getValidationStatus(item) === 'rejected').length,
    }),
    [items]
  );

  const openReviewModal = (item: EvidenceRecord) => {
    setSelectedItem(item);
    setDecision('accepted');
    setLabResult('');
    setFollowup('');
    setError('');
    setSuccess('');
  };

  const closeReviewModal = () => {
    setSelectedItem(null);
    setLabResult('');
    setFollowup('');
    setDecision('accepted');
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedItem) return;
    const resultText = labResult.trim();
    if (!resultText) {
      setError('ثبت نتیجه آزمایش برای تایید یا رد مدرک الزامی است.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      const updated = await coronerApi.reviewBioEvidence(selectedItem.id, {
        lab_result: resultText,
        result_followup: followup.trim(),
        bio_validation_status: decision,
      });

      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));

      setSuccess(
        decision === 'accepted'
          ? `مدرک #${selectedItem.id} تایید شد و برای کارآگاه قابل استفاده است.`
          : `مدرک #${selectedItem.id} رد شد.`
      );
      closeReviewModal();
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت نتیجه آزمایش با خطا مواجه شد.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedModule moduleId="coroner-lab">
      <div className="coroner-lab-page">
      <header className="coroner-header">
        <div>
          <h1>آزمایشگاه مدارک</h1>
          <p>مدارک زیستی/پزشکی را بررسی کنید و وضعیت «منتظر آزمایش» را تعیین تکلیف کنید.</p>
        </div>
        <button type="button" onClick={loadData} disabled={loading}>
          {loading ? '...' : 'بارگذاری مجدد'}
        </button>
      </header>

      {(error || success) && (
        <div className={`coroner-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
      )}

      <div className="coroner-filters">
        <button
          type="button"
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          منتظر آزمایش ({counts.pending})
        </button>
        <button
          type="button"
          className={filter === 'accepted' ? 'active' : ''}
          onClick={() => setFilter('accepted')}
        >
          تایید شده ({counts.accepted})
        </button>
        <button
          type="button"
          className={filter === 'rejected' ? 'active' : ''}
          onClick={() => setFilter('rejected')}
        >
          رد شده ({counts.rejected})
        </button>
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          همه ({items.length})
        </button>
      </div>

      {loading ? (
        <div className="coroner-empty">در حال بارگذاری مدارک زیستی...</div>
      ) : filteredItems.length === 0 ? (
        <div className="coroner-empty">مدرکی برای این فیلتر وجود ندارد.</div>
      ) : (
        <div className="coroner-grid">
          {filteredItems.map((item) => {
            const status = getValidationStatus(item);
            return (
              <article key={item.id} className="coroner-card">
                <div className="coroner-card-top">
                  <h3>
                    #{item.id} - {item.title}
                  </h3>
                  <span className={`badge ${status}`}>{statusLabelMap[status]}</span>
                </div>
                <p>{item.description}</p>
                <div className="coroner-meta">
                  <span>پرونده: #{item.case}</span>
                  <span>ثبت: {formatDate(item.created_at)}</span>
                </div>
                <div className="coroner-details">
                  <div>
                    <strong>نتیجه آزمایش فعلی:</strong>
                    <p>{String((item.details as { lab_result?: unknown }).lab_result || 'ثبت نشده')}</p>
                  </div>
                  <div>
                    <strong>وضعیت پیگیری:</strong>
                    <p>{String((item.details as { result_followup?: unknown }).result_followup || 'ثبت نشده')}</p>
                  </div>
                </div>
                <button type="button" className="review-btn" onClick={() => openReviewModal(item)}>
                  بررسی و اعتبارسنجی
                </button>
              </article>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <div className="coroner-modal-overlay" onClick={closeReviewModal}>
          <div className="coroner-modal" onClick={(event) => event.stopPropagation()}>
            <div className="coroner-modal-header">
              <h3>بررسی مدرک #{selectedItem.id}</h3>
              <button type="button" onClick={closeReviewModal}>
                ×
              </button>
            </div>
            <form className="coroner-modal-form" onSubmit={submitReview}>
              <p className="evidence-title">{selectedItem.title}</p>
              <label>
                تصمیم
                <select value={decision} onChange={(event) => setDecision(event.target.value as 'accepted' | 'rejected')}>
                  <option value="accepted">تایید</option>
                  <option value="rejected">رد</option>
                </select>
              </label>

              <label>
                نتیجه آزمایش
                <textarea
                  rows={4}
                  value={labResult}
                  onChange={(event) => setLabResult(event.target.value)}
                  required
                  placeholder="نتیجه نهایی آزمایش خون / DNA / اثر انگشت را ثبت کنید."
                />
              </label>

              <label>
                وضعیت پیگیری / توضیح تکمیلی
                <textarea
                  rows={3}
                  value={followup}
                  onChange={(event) => setFollowup(event.target.value)}
                  placeholder="توضیح تکمیلی برای کارآگاه"
                />
              </label>

              <div className="coroner-modal-actions">
                <button type="button" className="cancel" onClick={closeReviewModal} disabled={submitting}>
                  انصراف
                </button>
                <button type="submit" disabled={submitting}>
                  {submitting ? 'در حال ثبت...' : 'ثبت نتیجه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </ProtectedModule>
  );
};

export default CoronerLab;
