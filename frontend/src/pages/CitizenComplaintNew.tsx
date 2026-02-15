import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { complaintsApi } from '../services';
import './CitizenComplaintNew.css';

type ComplaintFormState = {
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
};

const initialForm: ComplaintFormState = {
  title: '',
  description: '',
  location: '',
  incident_datetime: '',
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

const CitizenComplaintNew = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<ComplaintFormState>(initialForm);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [attachmentDraft, setAttachmentDraft] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!showAttachmentModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showAttachmentModal]);

  const closeAttachmentModal = () => {
    setShowAttachmentModal(false);
    setAttachmentDraft([]);
  };

  const addAttachmentDraftToComplaint = () => {
    if (attachmentDraft.length === 0) {
      setError('حداقل یک فایل برای افزودن مدرک انتخاب کنید.');
      return;
    }
    setAttachments((prev) => [...prev, ...attachmentDraft]);
    closeAttachmentModal();
  };

  const removeAttachmentAt = (index: number) => {
    setAttachments((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!form.title.trim() || !form.description.trim() || !form.location.trim() || !form.incident_datetime) {
      setError('تمام فیلدها الزامی هستند.');
      return;
    }

    try {
      setLoading(true);
      const payload = new FormData();
      payload.append('title', form.title.trim());
      payload.append('description', form.description.trim());
      payload.append('location', form.location.trim());
      payload.append('incident_datetime', new Date(form.incident_datetime).toISOString());
      attachments.forEach((file) => payload.append('attachment_files', file));

      await complaintsApi.create(payload);
      setSuccess('شکایت شما با موفقیت ثبت شد و در صف بررسی قرار گرفت.');
      setForm(initialForm);
      setAttachments([]);
      setAttachmentDraft([]);
      setShowAttachmentModal(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت شکایت با خطا مواجه شد.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="citizen-new-complaint-page">
      <div className="citizen-new-complaint-header">
        <h1>ثبت شکایت جدید</h1>
        <p>اطلاعات را با دقت ثبت کنید تا فرآیند بررسی سریع‌تر انجام شود.</p>
      </div>

      {(error || success) && (
        <div className={`new-complaint-feedback ${error ? 'error' : 'success'}`}>
          {error || success}
        </div>
      )}

      <form className="new-complaint-form" onSubmit={handleSubmit}>
        <label htmlFor="new-title">عنوان شکایت</label>
        <input
          id="new-title"
          type="text"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          disabled={loading}
          required
        />

        <label htmlFor="new-description">شرح کامل شکایت</label>
        <textarea
          id="new-description"
          rows={6}
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          disabled={loading}
          required
        />

        <label htmlFor="new-location">مکان حادثه</label>
        <input
          id="new-location"
          type="text"
          value={form.location}
          onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
          disabled={loading}
          required
        />

        <label htmlFor="new-incident-datetime">زمان وقوع</label>
        <input
          id="new-incident-datetime"
          type="datetime-local"
          value={form.incident_datetime}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, incident_datetime: event.target.value }))
          }
          disabled={loading}
          required
        />

        <div className="new-attachment-header">
          <label>مدارک ضمیمه (اختیاری)</label>
          <button
            type="button"
            className="new-attachment-add-btn"
            onClick={() => {
              setError('');
              setAttachmentDraft([]);
              setShowAttachmentModal(true);
            }}
            disabled={loading}
          >
            ثبت مدرک جدید
          </button>
        </div>
        {attachments.length > 0 && (
          <div className="new-attachment-list">
            {attachments.map((file, index) => (
              <div key={`${file.name}-${file.size}-${index}`} className="new-attachment-item">
                <span>{file.name}</span>
                <button
                  type="button"
                  className="new-attachment-remove-btn"
                  onClick={() => removeAttachmentAt(index)}
                  disabled={loading}
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="new-complaint-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/citizen/complaints')}>
            بازگشت به پیگیری شکایات
          </button>
          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'در حال ثبت...' : 'ثبت شکایت'}
          </button>
        </div>
      </form>

      {showAttachmentModal && (
        <div className="new-attachment-modal-overlay" onClick={closeAttachmentModal}>
          <div className="new-attachment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="new-attachment-modal-header">
              <h3>افزودن مدرک به شکایت</h3>
              <button type="button" onClick={closeAttachmentModal} aria-label="بستن">
                ×
              </button>
            </div>

            <div className="new-attachment-modal-body">
              <label htmlFor="new-attachment-modal-input">انتخاب فایل(ها)</label>
              <input
                id="new-attachment-modal-input"
                type="file"
                multiple
                onChange={(event) => setAttachmentDraft(Array.from(event.target.files || []))}
              />

              {attachmentDraft.length > 0 && (
                <div className="new-attachment-draft-list">
                  {attachmentDraft.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${index}`}>{file.name}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="new-attachment-modal-actions">
              <button type="button" className="secondary-btn" onClick={closeAttachmentModal}>
                انصراف
              </button>
              <button type="button" className="primary-btn" onClick={addAttachmentDraftToComplaint}>
                افزودن به شکایت
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CitizenComplaintNew;
