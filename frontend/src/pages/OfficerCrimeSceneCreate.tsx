import { useState } from 'react';
import { crimeSceneApi } from '../services';
import ProtectedModule from '../components/ProtectedModule';
import './OfficerCrimeSceneCreate.css';

type LocalWitness = {
  full_name: string;
  national_id: string;
  phone_number: string;
};

type CrimeSceneFormState = {
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  severity: number;
  local_witnesses: LocalWitness[];
};

const initialForm: CrimeSceneFormState = {
  title: '',
  description: '',
  location: '',
  incident_datetime: '',
  severity: 2,
  local_witnesses: [{ full_name: '', national_id: '', phone_number: '' }],
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

const statusLabelMap: Record<string, string> = {
  Open: 'باز (تایید شده)',
  PendingOfficer: 'در انتظار تایید مافوق',
};

const OfficerCrimeSceneCreate = () => {
  const [form, setForm] = useState<CrimeSceneFormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createdCase, setCreatedCase] = useState<{ id: number; status: string } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (
      !form.title.trim() ||
      !form.description.trim() ||
      !form.location.trim() ||
      !form.incident_datetime
    ) {
      setError('تمام فیلدهای اصلی الزامی هستند.');
      return;
    }

    try {
      setLoading(true);
      const validWitnesses = form.local_witnesses
        .map((item) => ({
          full_name: item.full_name.trim(),
          national_id: item.national_id.trim(),
          phone_number: item.phone_number.trim(),
        }))
        .filter((item) => item.national_id && item.phone_number);

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        incident_datetime: new Date(form.incident_datetime).toISOString(),
        severity: form.severity,
        local_witnesses: validWitnesses.length > 0 ? validWitnesses : undefined,
      };

      const response = await crimeSceneApi.create(payload);
      setCreatedCase({ id: response.id, status: response.status });
      setSuccess(
        `صحنه جرم ثبت شد. پرونده #${response.id} با وضعیت «${
          statusLabelMap[response.status] || response.status
        }» ایجاد گردید.`
      );
      setForm(initialForm);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت صحنه جرم با خطا مواجه شد.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedModule moduleId="officer-crime-scene">
      <div className="officer-crime-scene-page">
        <div className="officer-crime-scene-header">
          <h1>ثبت سریع صحنه جرم</h1>
          <p>
            برای گزارش مستقیم صحنه جرم (بدون شاکی اولیه) از این فرم استفاده کنید.
            در صورت نیاز پرونده به تایید رده مافوق ارسال می‌شود.
          </p>
        </div>

        {(error || success) && (
          <div className={`crime-scene-feedback ${error ? 'error' : 'success'}`}>
            {error || success}
          </div>
        )}

        <form className="crime-scene-form" onSubmit={handleSubmit}>
          <label htmlFor="crime-scene-title">عنوان گزارش</label>
          <input
            id="crime-scene-title"
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            required
            disabled={loading}
          />

          <label htmlFor="crime-scene-description">شرح صحنه جرم</label>
          <textarea
            id="crime-scene-description"
            rows={6}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            required
            disabled={loading}
          />

          <div className="crime-scene-row">
            <div>
              <label htmlFor="crime-scene-location">مکان وقوع</label>
              <input
                id="crime-scene-location"
                type="text"
                value={form.location}
                onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                required
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="crime-scene-time">زمان وقوع</label>
              <input
                id="crime-scene-time"
                type="datetime-local"
                value={form.incident_datetime}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, incident_datetime: event.target.value }))
                }
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="crime-scene-row">
            <div>
              <label htmlFor="crime-scene-severity">سطح جرم</label>
              <select
                id="crime-scene-severity"
                value={form.severity}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, severity: Number(event.target.value) }))
                }
                disabled={loading}
              >
                <option value={1}>سطح ۳ (خرد)</option>
                <option value={2}>سطح ۲</option>
                <option value={3}>سطح ۱</option>
                <option value={4}>بحرانی</option>
              </select>
            </div>
            <div className="crime-scene-empty-cell" />
          </div>

          <div className="crime-scene-witness-section">
            <div className="crime-scene-witness-header">
              <h3>شاهدان محلی (اختیاری)</h3>
              <button
                type="button"
                className="details-btn"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    local_witnesses: [...prev.local_witnesses, { full_name: '', national_id: '', phone_number: '' }],
                  }))
                }
              >
                افزودن شاهد
              </button>
            </div>

            <div className="crime-scene-witness-list">
              {form.local_witnesses.map((witness, index) => (
                <div key={index} className="crime-scene-witness-item">
                  <input
                    type="text"
                    placeholder="نام شاهد (اختیاری)"
                    value={witness.full_name}
                    onChange={(event) =>
                      setForm((prev) => {
                        const local_witnesses = [...prev.local_witnesses];
                        local_witnesses[index] = { ...local_witnesses[index], full_name: event.target.value };
                        return { ...prev, local_witnesses };
                      })
                    }
                    disabled={loading}
                  />
                  <input
                    type="text"
                    placeholder="کد ملی شاهد"
                    value={witness.national_id}
                    onChange={(event) =>
                      setForm((prev) => {
                        const local_witnesses = [...prev.local_witnesses];
                        local_witnesses[index] = { ...local_witnesses[index], national_id: event.target.value };
                        return { ...prev, local_witnesses };
                      })
                    }
                    disabled={loading}
                  />
                  <input
                    type="text"
                    placeholder="شماره تماس شاهد"
                    value={witness.phone_number}
                    onChange={(event) =>
                      setForm((prev) => {
                        const local_witnesses = [...prev.local_witnesses];
                        local_witnesses[index] = { ...local_witnesses[index], phone_number: event.target.value };
                        return { ...prev, local_witnesses };
                      })
                    }
                    disabled={loading}
                  />
                  {form.local_witnesses.length > 1 && (
                    <button
                      type="button"
                      className="return-btn"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          local_witnesses: prev.local_witnesses.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                      disabled={loading}
                    >
                      حذف
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="crime-scene-actions">
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'در حال ثبت...' : 'ثبت صحنه جرم'}
            </button>
          </div>
        </form>

        {createdCase && (
          <div className="crime-scene-result">
            <h3>آخرین ثبت موفق</h3>
            <p>پرونده #{createdCase.id}</p>
            <p>وضعیت: {statusLabelMap[createdCase.status] || createdCase.status}</p>
          </div>
        )}
      </div>
    </ProtectedModule>
  );
};

export default OfficerCrimeSceneCreate;
