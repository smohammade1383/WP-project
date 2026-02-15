import { useEffect, useMemo, useState } from 'react';
import ProtectedModule from '../components/ProtectedModule';
import { evidenceApi, type EvidenceRecord } from '../services';
import './OfficerEvidenceReview.css';

const evidenceTypeLabels: Record<string, string> = {
  transcription: 'استشهاد / رسانه',
  bio_medical: 'زیستی / پزشکی',
  vehicle: 'وسیله نقلیه',
  identity_document: 'مدرک هویتی',
  other: 'سایر',
};

const caseSeverityLabels: Record<number, string> = {
  1: 'سطح ۳',
  2: 'سطح ۲',
  3: 'سطح ۱',
  4: 'بحرانی',
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '-';
  return new Date(value).toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const buildMediaUrl = (path: string): string => {
  const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
  const origin = new URL(base).origin;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.replace(/^\/+/, '');
  if (normalized.startsWith('media/')) {
    return `${origin}/${normalized}`;
  }
  return `${origin}/media/${normalized}`;
};

const OfficerEvidenceReview = () => {
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<EvidenceRecord | null>(null);
  const [rejectMessage, setRejectMessage] = useState('');

  useEffect(() => {
    if (!selectedEvidence && !rejectTarget) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedEvidence, rejectTarget]);

  const loadPendingEvidence = async () => {
    try {
      setLoading(true);
      const data = await evidenceApi.listOfficerPending();
      setItems(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'دریافت مدارک در صف بررسی با خطا مواجه شد.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPendingEvidence();
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => {
      const creatorName = `${item.created_by.first_name || ''} ${item.created_by.last_name || ''}`.trim();
      return [
        String(item.id),
        item.title,
        item.description,
        item.case_title || '',
        creatorName,
        item.created_by.username,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [items, search]);

  const submitDecision = async (
    evidenceId: number,
    decision: 'approved' | 'rejected',
    message = ''
  ): Promise<boolean> => {
    try {
      setSubmittingId(evidenceId);
      setError('');
      setSuccess('');
      await evidenceApi.officerReview(evidenceId, { decision, message });
      setSuccess(
        decision === 'approved'
          ? `مدرک #${evidenceId} با موفقیت تأیید شد.`
          : `مدرک #${evidenceId} رد شد و پیام بازخورد ثبت گردید.`
      );
      if (selectedEvidence?.id === evidenceId) {
        setSelectedEvidence(null);
      }
      await loadPendingEvidence();
      return true;
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت نتیجه بررسی مدرک با خطا مواجه شد.'));
      return false;
    } finally {
      setSubmittingId(null);
    }
  };

  const handleApprove = async (evidenceId: number) => {
    await submitDecision(evidenceId, 'approved');
  };

  const handleRejectSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rejectTarget) return;
    const message = rejectMessage.trim();
    if (!message) {
      setError('برای رد مدرک، ثبت دلیل رد الزامی است.');
      return;
    }
    const done = await submitDecision(rejectTarget.id, 'rejected', message);
    if (done) {
      setRejectTarget(null);
      setRejectMessage('');
    }
  };

  const renderEvidenceDetails = (item: EvidenceRecord) => {
    const details = item.details || {};

    if (item.type === 'transcription') {
      const text = typeof details.transcript_text === 'string' ? details.transcript_text : '';
      const mediaFiles = Array.isArray(details.media_files)
        ? details.media_files.filter((entry): entry is string => typeof entry === 'string')
        : [];
      return (
        <div className="officer-evidence-modal-block">
          <h4>جزئیات استشهاد</h4>
          <p>{text || 'بدون متن استشهاد.'}</p>
          {mediaFiles.length > 0 && (
            <div className="officer-evidence-media-list">
              {mediaFiles.map((file) => (
                <a key={file} href={buildMediaUrl(file)} target="_blank" rel="noreferrer">
                  مشاهده فایل
                </a>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (item.type === 'bio_medical') {
      const resultFollowup = typeof details.result_followup === 'string' ? details.result_followup : '';
      const labResult = typeof details.lab_result === 'string' ? details.lab_result : '';
      const images = Array.isArray(details.images)
        ? details.images.filter((entry): entry is string => typeof entry === 'string')
        : [];
      return (
        <div className="officer-evidence-modal-block">
          <h4>جزئیات زیستی/پزشکی</h4>
          <p><strong>پیگیری:</strong> {resultFollowup || 'ثبت نشده'}</p>
          <p><strong>نتیجه آزمایش:</strong> {labResult || 'ثبت نشده'}</p>
          {images.length > 0 && (
            <div className="officer-evidence-image-grid">
              {images.map((image) => (
                <a key={image} href={buildMediaUrl(image)} target="_blank" rel="noreferrer">
                  <img src={buildMediaUrl(image)} alt="bio evidence" />
                </a>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (item.type === 'vehicle') {
      return (
        <div className="officer-evidence-modal-block">
          <h4>جزئیات وسیله نقلیه</h4>
          <p><strong>مدل:</strong> {typeof details.model === 'string' ? details.model : '-'}</p>
          <p><strong>رنگ:</strong> {typeof details.color === 'string' ? details.color : '-'}</p>
          <p><strong>پلاک:</strong> {typeof details.license_plate === 'string' && details.license_plate ? details.license_plate : '-'}</p>
          <p><strong>شماره سریال:</strong> {typeof details.serial_number === 'string' && details.serial_number ? details.serial_number : '-'}</p>
        </div>
      );
    }

    if (item.type === 'identity_document') {
      const owner = typeof details.owner_full_name === 'string' ? details.owner_full_name : '-';
      const fields = details.fields && typeof details.fields === 'object' ? (details.fields as Record<string, string>) : {};
      return (
        <div className="officer-evidence-modal-block">
          <h4>جزئیات مدرک هویتی</h4>
          <p><strong>نام صاحب مدرک:</strong> {owner}</p>
          <div className="officer-evidence-kv-grid">
            {Object.keys(fields).length === 0 ? (
              <p>کلید/مقداری ثبت نشده است.</p>
            ) : (
              Object.entries(fields).map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{value}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="officer-evidence-modal-block">
        <h4>جزئیات</h4>
        <p>برای این نوع مدرک جزئیات تکمیلی ثبت نشده است.</p>
      </div>
    );
  };

  return (
    <ProtectedModule moduleId="officer-evidence-review">
      <div className="officer-evidence-page">
        <div className="officer-evidence-header">
          <div>
            <h1>تایید یا رد مدارک</h1>
            <p>مدارک ارسالی کاربران را بررسی کنید و نتیجه را ثبت نمایید.</p>
          </div>
          <div className="officer-evidence-summary">در صف بررسی: {items.length}</div>
        </div>

        <div className="officer-evidence-search">
          <input
            type="search"
            placeholder="جستجو بر اساس عنوان، پرونده یا ثبت‌کننده..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {(error || success) && (
          <div className={`officer-evidence-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        {loading ? (
          <div className="officer-evidence-empty">در حال بارگذاری مدارک...</div>
        ) : filteredItems.length === 0 ? (
          <div className="officer-evidence-empty">
            <h3>مدرکی در صف بررسی وجود ندارد.</h3>
            <p>مدارک جدید کاربران بعد از ثبت، در این بخش نمایش داده می‌شوند.</p>
          </div>
        ) : (
          <div className="officer-evidence-grid">
            {filteredItems.map((item) => (
              <article key={item.id} className="officer-evidence-card">
                <div className="officer-evidence-card-header">
                  <h3>
                    #{item.id} - {item.title}
                  </h3>
                  <span className="officer-evidence-type">
                    {evidenceTypeLabels[item.type] || item.type}
                  </span>
                </div>

                <p className="officer-evidence-description">{item.description}</p>

                <div className="officer-evidence-meta">
                  <div>
                    <span>پرونده</span>
                    <strong>{item.case_title || `#${item.case}`}</strong>
                  </div>
                  <div>
                    <span>سطح پرونده</span>
                    <strong>{item.case_severity ? caseSeverityLabels[item.case_severity] || item.case_severity : '-'}</strong>
                  </div>
                  <div>
                    <span>ثبت‌کننده</span>
                    <strong>
                      {`${item.created_by.first_name || ''} ${item.created_by.last_name || ''}`.trim() ||
                        item.created_by.username}
                    </strong>
                  </div>
                  <div>
                    <span>تاریخ ثبت</span>
                    <strong>{formatDate(item.created_at)}</strong>
                  </div>
                </div>

                <div className="officer-evidence-actions">
                  <button
                    type="button"
                    className="details-btn"
                    onClick={() => setSelectedEvidence(item)}
                  >
                    مشاهده جزئیات
                  </button>
                  <button
                    type="button"
                    className="approve-btn"
                    onClick={() => void handleApprove(item.id)}
                    disabled={submittingId === item.id}
                  >
                    {submittingId === item.id ? 'در حال ثبت...' : 'تایید'}
                  </button>
                  <button
                    type="button"
                    className="return-btn"
                    onClick={() => setRejectTarget(item)}
                    disabled={submittingId === item.id}
                  >
                    رد مدرک
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {selectedEvidence && (
          <div className="officer-evidence-modal-overlay" onClick={() => setSelectedEvidence(null)}>
            <div className="officer-evidence-modal" onClick={(event) => event.stopPropagation()}>
              <div className="officer-evidence-modal-header">
                <h3>جزئیات مدرک #{selectedEvidence.id}</h3>
                <button type="button" onClick={() => setSelectedEvidence(null)} aria-label="بستن">
                  ×
                </button>
              </div>

              <div className="officer-evidence-modal-content">
                <div className="officer-evidence-modal-block">
                  <h4>اطلاعات پایه</h4>
                  <p><strong>عنوان:</strong> {selectedEvidence.title}</p>
                  <p><strong>شرح:</strong> {selectedEvidence.description}</p>
                  <p><strong>نوع:</strong> {evidenceTypeLabels[selectedEvidence.type] || selectedEvidence.type}</p>
                  <p><strong>پرونده:</strong> {selectedEvidence.case_title || `#${selectedEvidence.case}`}</p>
                  <p><strong>ثبت‌کننده:</strong> {`${selectedEvidence.created_by.first_name || ''} ${selectedEvidence.created_by.last_name || ''}`.trim() || selectedEvidence.created_by.username}</p>
                  <p><strong>تاریخ ثبت:</strong> {formatDate(selectedEvidence.created_at)}</p>
                </div>
                {renderEvidenceDetails(selectedEvidence)}
              </div>
            </div>
          </div>
        )}

        {rejectTarget && (
          <div className="officer-evidence-modal-overlay" onClick={() => setRejectTarget(null)}>
            <div className="officer-evidence-modal reject" onClick={(event) => event.stopPropagation()}>
              <div className="officer-evidence-modal-header">
                <h3>رد مدرک #{rejectTarget.id}</h3>
                <button
                  type="button"
                  onClick={() => {
                    setRejectTarget(null);
                    setRejectMessage('');
                  }}
                  aria-label="بستن"
                >
                  ×
                </button>
              </div>
              <form className="officer-evidence-reject-form" onSubmit={handleRejectSubmit}>
                <label htmlFor="reject-evidence-message">دلیل رد</label>
                <textarea
                  id="reject-evidence-message"
                  rows={5}
                  value={rejectMessage}
                  onChange={(event) => setRejectMessage(event.target.value)}
                  placeholder="مثال: مدرک خوانا نیست یا ارتباط کافی با پرونده ندارد."
                  required
                />
                <div className="officer-evidence-modal-actions">
                  <button
                    type="button"
                    className="details-btn"
                    onClick={() => {
                      setRejectTarget(null);
                      setRejectMessage('');
                    }}
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="return-btn"
                    disabled={submittingId === rejectTarget.id}
                  >
                    {submittingId === rejectTarget.id ? 'در حال ثبت...' : 'ثبت رد مدرک'}
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

export default OfficerEvidenceReview;
