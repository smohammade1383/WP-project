import { useState } from 'react';
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
  const [secondaryComplainantIds, setSecondaryComplainantIds] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const parseUserIds = (raw: string): number[] => {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
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
      const complaint = await complaintsApi.create({
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        incident_datetime: new Date(form.incident_datetime).toISOString(),
      });

      let successMessage = 'شکایت شما با موفقیت ثبت شد و در صف بررسی قرار گرفت.';
      const ids = parseUserIds(secondaryComplainantIds);
      if (ids.length > 0) {
        try {
          await complaintsApi.requestSecondaryComplainants(complaint.id, {
            complainant_ids: ids,
          });
          successMessage += ' درخواست بررسی شاکیان فرعی نیز برای کارآموز ثبت شد.';
        } catch (secondaryErr: unknown) {
          successMessage += ` اما درخواست شاکیان فرعی ثبت نشد (${getErrorMessage(
            secondaryErr,
            'خطای نامشخص'
          )}). می‌توانید از صفحه پیگیری شکایات دوباره ارسال کنید.`;
        }
      }

      setSuccess(successMessage);
      setForm(initialForm);
      setSecondaryComplainantIds('');
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

        <label htmlFor="new-secondary-complainants">شناسه شاکیان فرعی (اختیاری)</label>
        <input
          id="new-secondary-complainants"
          type="text"
          value={secondaryComplainantIds}
          onChange={(event) => setSecondaryComplainantIds(event.target.value)}
          placeholder="مثال: 12, 18"
          disabled={loading}
        />
        <p className="secondary-help-text">
          در صورت ورود شناسه، برای هر مورد درخواست «در انتظار تایید کارآموز» ثبت می‌شود.
        </p>

        <div className="new-complaint-actions">
          <button type="button" className="secondary-btn" onClick={() => navigate('/citizen/complaints')}>
            بازگشت به پیگیری شکایات
          </button>
          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'در حال ثبت...' : 'ثبت شکایت'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CitizenComplaintNew;
