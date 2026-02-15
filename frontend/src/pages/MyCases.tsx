import { useCallback, useEffect, useMemo, useState } from 'react';
import ProtectedModule from '../components/ProtectedModule';
import {
  evidenceApi,
  myCasesApi,
  type CitizenCaseSummary,
  type EvidenceRecord,
  type EvidenceType,
} from '../services';
import './MyCases.css';

type FilterType = 'all' | 'active' | 'pending' | 'closed';

type IdentityField = {
  key: string;
  value: string;
};

type EvidenceFormState = {
  title: string;
  description: string;
  transcript_text: string;
  result_followup: string;
  vehicle_model: string;
  vehicle_color: string;
  license_plate: string;
  serial_number: string;
  owner_full_name: string;
};

const initialEvidenceForm: EvidenceFormState = {
  title: '',
  description: '',
  transcript_text: '',
  result_followup: '',
  vehicle_model: '',
  vehicle_color: '',
  license_plate: '',
  serial_number: '',
  owner_full_name: '',
};

const severityLabelMap: Record<number, string> = {
  1: 'سطح ۳',
  2: 'سطح ۲',
  3: 'سطح ۱',
  4: 'بحرانی',
};

const statusLabelMap: Record<string, string> = {
  Draft: 'پیش‌نویس',
  PendingCadet: 'در انتظار بررسی کارآموز',
  NeedsComplainantUpdate: 'نیازمند تکمیل شاکی',
  PendingOfficer: 'در انتظار بررسی افسر',
  Open: 'پرونده فعال',
  WarrantPending: 'درخواست دستگیری در حال بررسی',
  Arrested: 'متهم بازداشت شده',
  WaitingCaptain: 'در انتظار تصمیم کاپیتان',
  WaitingChief: 'در انتظار تایید رئیس پلیس',
  InCourt: 'ارسال شده به دادگاه',
  Closed: 'مختومه',
  Void: 'باطل',
};

const evidenceTypeLabelMap: Record<EvidenceType, string> = {
  transcription: 'استشهاد / صوت / تصویر',
  bio_medical: 'زیستی / پزشکی',
  vehicle: 'وسیله نقلیه',
  identity_document: 'مدرک شناسایی',
  other: 'سایر',
};

const roleLabelMap: Record<string, string> = {
  case_owner: 'ثبت‌کننده پرونده',
  complainant: 'شاکی',
  witness: 'شاهد',
  suspect: 'مظنون',
  viewer: 'مشاهده‌گر',
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
    if ('data' in error) {
      const data = (error as { data?: unknown }).data;
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail.trim()) {
          return detail;
        }
      }
    }
  }
  return fallback;
};

const formatDate = (value: string): string =>
  new Date(value).toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const resolveCaseStatusCategory = (status: string): Exclude<FilterType, 'all'> => {
  if (status === 'Closed' || status === 'Void') return 'closed';
  if (
    status === 'Open' ||
    status === 'WarrantPending' ||
    status === 'Arrested' ||
    status === 'WaitingCaptain' ||
    status === 'WaitingChief' ||
    status === 'InCourt'
  ) {
    return 'active';
  }
  return 'pending';
};

const MyCases = () => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [cases, setCases] = useState<CitizenCaseSummary[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedCase, setSelectedCase] = useState<CitizenCaseSummary | null>(null);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('transcription');
  const [evidenceForm, setEvidenceForm] = useState<EvidenceFormState>(initialEvidenceForm);
  const [identityFields, setIdentityFields] = useState<IdentityField[]>([{ key: '', value: '' }]);
  const [transcriptionFiles, setTranscriptionFiles] = useState<File[]>([]);
  const [bioImages, setBioImages] = useState<File[]>([]);
  const [submittingEvidence, setSubmittingEvidence] = useState(false);
  const [myEvidenceItems, setMyEvidenceItems] = useState<EvidenceRecord[]>([]);
  const [loadingMyEvidence, setLoadingMyEvidence] = useState(false);

  useEffect(() => {
    if (!showEvidenceModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showEvidenceModal]);

  const loadCases = useCallback(async () => {
    try {
      setLoadingCases(true);
      const rows = await myCasesApi.listSummaries();
      setCases(rows);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'دریافت پرونده‌ها با خطا مواجه شد.'));
    } finally {
      setLoadingCases(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const loadMyEvidence = useCallback(async (caseId: number) => {
    try {
      setLoadingMyEvidence(true);
      const evidence = await evidenceApi.listByCase(caseId);
      setMyEvidenceItems(evidence);
    } catch {
      setMyEvidenceItems([]);
    } finally {
      setLoadingMyEvidence(false);
    }
  }, []);

  const filteredCases = useMemo(() => {
    if (filter === 'all') return cases;
    return cases.filter((item) => resolveCaseStatusCategory(item.status) === filter);
  }, [cases, filter]);

  const activeCases = useMemo(
    () => cases.filter((item) => resolveCaseStatusCategory(item.status) === 'active').length,
    [cases]
  );
  const pendingCases = useMemo(
    () => cases.filter((item) => resolveCaseStatusCategory(item.status) === 'pending').length,
    [cases]
  );
  const closedCases = useMemo(
    () => cases.filter((item) => resolveCaseStatusCategory(item.status) === 'closed').length,
    [cases]
  );

  const resetEvidenceForm = () => {
    setEvidenceType('transcription');
    setEvidenceForm(initialEvidenceForm);
    setIdentityFields([{ key: '', value: '' }]);
    setTranscriptionFiles([]);
    setBioImages([]);
  };

  const openEvidenceModal = (caseItem: CitizenCaseSummary) => {
    setSelectedCase(caseItem);
    setShowEvidenceModal(true);
    setSuccess('');
    setError('');
    resetEvidenceForm();
    void loadMyEvidence(caseItem.id);
  };

  const closeEvidenceModal = () => {
    setShowEvidenceModal(false);
    setSelectedCase(null);
    setMyEvidenceItems([]);
    resetEvidenceForm();
  };

  const updateEvidenceField = (field: keyof EvidenceFormState, value: string) => {
    setEvidenceForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateEvidenceForm = (): string | null => {
    if (!selectedCase) return 'پرونده انتخاب نشده است.';
    if (!evidenceForm.title.trim()) return 'عنوان مدرک الزامی است.';
    if (!evidenceForm.description.trim()) return 'توضیح مدرک الزامی است.';

    if (evidenceType === 'transcription' && !evidenceForm.transcript_text.trim()) {
      return 'برای مدرک استشهاد، متن استشهاد الزامی است.';
    }

    if (evidenceType === 'vehicle') {
      if (!evidenceForm.vehicle_model.trim() || !evidenceForm.vehicle_color.trim()) {
        return 'برای مدرک وسیله نقلیه، مدل و رنگ الزامی هستند.';
      }
      const hasPlate = Boolean(evidenceForm.license_plate.trim());
      const hasSerial = Boolean(evidenceForm.serial_number.trim());
      if (hasPlate === hasSerial) {
        return 'فقط یکی از فیلدهای پلاک یا شماره سریال باید پر شود.';
      }
    }

    if (evidenceType === 'identity_document' && !evidenceForm.owner_full_name.trim()) {
      return 'برای مدرک شناسایی، نام صاحب مدرک الزامی است.';
    }

    return null;
  };

  const submitEvidence = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateEvidenceForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!selectedCase) return;

    try {
      setSubmittingEvidence(true);
      setError('');

      const basePayload = {
        case: selectedCase.id,
        title: evidenceForm.title.trim(),
        description: evidenceForm.description.trim(),
        type: evidenceType,
      };

      let payload: Record<string, unknown> | FormData = {
        ...basePayload,
      };

      if (evidenceType === 'transcription') {
        if (transcriptionFiles.length > 0) {
          const formData = new FormData();
          formData.append('case', String(selectedCase.id));
          formData.append('title', basePayload.title);
          formData.append('description', basePayload.description);
          formData.append('type', evidenceType);
          formData.append('transcript_text', evidenceForm.transcript_text.trim());
          transcriptionFiles.forEach((file) => formData.append('media_files', file));
          payload = formData;
        } else {
          payload = {
            ...basePayload,
            transcript_text: evidenceForm.transcript_text.trim(),
          };
        }
      } else if (evidenceType === 'bio_medical') {
        if (bioImages.length > 0) {
          const formData = new FormData();
          formData.append('case', String(selectedCase.id));
          formData.append('title', basePayload.title);
          formData.append('description', basePayload.description);
          formData.append('type', evidenceType);
          formData.append('result_followup', evidenceForm.result_followup.trim());
          bioImages.forEach((file) => formData.append('images', file));
          payload = formData;
        } else {
          payload = {
            ...basePayload,
            result_followup: evidenceForm.result_followup.trim(),
          };
        }
      } else if (evidenceType === 'vehicle') {
        payload = {
          ...basePayload,
          vehicle_model: evidenceForm.vehicle_model.trim(),
          vehicle_color: evidenceForm.vehicle_color.trim(),
          license_plate: evidenceForm.license_plate.trim(),
          serial_number: evidenceForm.serial_number.trim(),
        };
      } else if (evidenceType === 'identity_document') {
        const fieldsObject = identityFields.reduce<Record<string, string>>((acc, item) => {
          const key = item.key.trim();
          const value = item.value.trim();
          if (key) {
            acc[key] = value;
          }
          return acc;
        }, {});
        payload = {
          ...basePayload,
          owner_full_name: evidenceForm.owner_full_name.trim(),
          identity_fields: fieldsObject,
        };
      }

      await evidenceApi.create(payload);
      setSuccess('مدرک با موفقیت ثبت شد.');
      resetEvidenceForm();
      await Promise.all([loadMyEvidence(selectedCase.id), loadCases()]);
    } catch (err) {
      setError(getErrorMessage(err, 'ثبت مدرک با خطا مواجه شد.'));
    } finally {
      setSubmittingEvidence(false);
    }
  };

  return (
    <ProtectedModule moduleId="citizen-case-evidence">
      <div className="my-cases-page">
        <div className="my-cases-header">
          <h1>📋 پرونده‌ها و ثبت مدرک</h1>
          <p>در این بخش فقط اطلاعات کلی پرونده نمایش داده می‌شود. برای هر پرونده می‌توانید مدرک جدید ثبت کنید.</p>
        </div>

        {(error || success) && (
          <div className={`my-cases-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        <div className="cases-stats">
          <div className="stat-card">
            <p className="stat-value">{activeCases}</p>
            <p className="stat-label">پرونده‌های فعال</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{pendingCases}</p>
            <p className="stat-label">در صف بررسی</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{closedCases}</p>
            <p className="stat-label">مختومه/باطل</p>
          </div>
          <div className="stat-card">
            <p className="stat-value">{cases.length}</p>
            <p className="stat-label">مجموع پرونده‌ها</p>
          </div>
        </div>

        <div className="cases-filters">
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            همه ({cases.length})
          </button>
          <button
            className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            فعال ({activeCases})
          </button>
          <button
            className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            در انتظار ({pendingCases})
          </button>
          <button
            className={`filter-btn ${filter === 'closed' ? 'active' : ''}`}
            onClick={() => setFilter('closed')}
          >
            مختومه ({closedCases})
          </button>
        </div>

        {loadingCases ? (
          <div className="no-cases">
            <div className="no-cases-icon">⏳</div>
            <h2>در حال بارگذاری پرونده‌ها...</h2>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="no-cases">
            <div className="no-cases-icon">📂</div>
            <h2>پرونده‌ای یافت نشد</h2>
            <p>پرونده‌ای مطابق فیلتر انتخابی وجود ندارد.</p>
          </div>
        ) : (
          <div className="cases-grid">
            {filteredCases.map((caseItem) => {
              const statusCategory = resolveCaseStatusCategory(caseItem.status);
              return (
                <article key={caseItem.id} className={`case-card status-${statusCategory}`}>
                  <div className="case-header">
                    <h3 className="case-title">{caseItem.title}</h3>
                    <span className={`case-status ${statusCategory}`}>
                      {statusLabelMap[caseItem.status] || caseItem.status}
                    </span>
                  </div>

                  <div className="case-info">
                    <div className="info-item">
                      <span className="info-label">کد پرونده</span>
                      <span className="info-value">{caseItem.case_code}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">سطح جرم</span>
                      <span className="info-value">{severityLabelMap[caseItem.severity] || caseItem.severity}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">نقش شما در پرونده</span>
                      <span className="info-value">{roleLabelMap[caseItem.my_role] || caseItem.my_role}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">مدارک ثبت‌شده توسط شما</span>
                      <span className="info-value">{caseItem.my_evidence_count}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">زمان آخرین تغییر</span>
                      <span className="info-value">{formatDate(caseItem.updated_at)}</span>
                    </div>
                  </div>

                  <p className="case-description">{caseItem.general_summary}</p>

                  <div className="case-footer">
                    <button className="action-btn primary" onClick={() => openEvidenceModal(caseItem)}>
                      ثبت مدرک برای این پرونده
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {showEvidenceModal && selectedCase && (
          <div className="evidence-modal-overlay" onClick={closeEvidenceModal}>
            <div className="evidence-modal" onClick={(event) => event.stopPropagation()}>
              <div className="evidence-modal-header">
                <div>
                  <h3>ثبت مدرک برای {selectedCase.case_code}</h3>
                  <p>{selectedCase.title}</p>
                </div>
                <button type="button" className="close-btn" onClick={closeEvidenceModal} aria-label="بستن">
                  ×
                </button>
              </div>

              <form className="evidence-form" onSubmit={submitEvidence}>
                <div className="form-row two-col">
                  <div>
                    <label>نوع مدرک</label>
                    <select
                      value={evidenceType}
                      onChange={(event) => {
                        setEvidenceType(event.target.value as EvidenceType);
                        setError('');
                      }}
                      disabled={submittingEvidence}
                    >
                      <option value="transcription">استشهاد / صوت / تصویر</option>
                      <option value="bio_medical">زیستی / پزشکی</option>
                      <option value="vehicle">وسیله نقلیه</option>
                      <option value="identity_document">مدرک شناسایی</option>
                      <option value="other">سایر</option>
                    </select>
                  </div>
                  <div>
                    <label>عنوان مدرک</label>
                    <input
                      type="text"
                      value={evidenceForm.title}
                      onChange={(event) => updateEvidenceField('title', event.target.value)}
                      disabled={submittingEvidence}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <label>توضیح کلی مدرک</label>
                  <textarea
                    rows={3}
                    value={evidenceForm.description}
                    onChange={(event) => updateEvidenceField('description', event.target.value)}
                    disabled={submittingEvidence}
                    required
                  />
                </div>

                {evidenceType === 'transcription' && (
                  <>
                    <div className="form-row">
                      <label>متن استشهاد</label>
                      <textarea
                        rows={3}
                        value={evidenceForm.transcript_text}
                        onChange={(event) => updateEvidenceField('transcript_text', event.target.value)}
                        disabled={submittingEvidence}
                        required
                      />
                    </div>
                    <div className="form-row">
                      <label>فایل‌های صوت/تصویر (اختیاری)</label>
                      <input
                        type="file"
                        multiple
                        onChange={(event) => setTranscriptionFiles(Array.from(event.target.files || []))}
                        disabled={submittingEvidence}
                      />
                    </div>
                  </>
                )}

                {evidenceType === 'bio_medical' && (
                  <>
                    <div className="form-row">
                      <label>شرح پیگیری اولیه</label>
                      <textarea
                        rows={2}
                        value={evidenceForm.result_followup}
                        onChange={(event) => updateEvidenceField('result_followup', event.target.value)}
                        disabled={submittingEvidence}
                      />
                    </div>
                    <div className="form-row">
                      <label>تصاویر مرتبط (اختیاری)</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) => setBioImages(Array.from(event.target.files || []))}
                        disabled={submittingEvidence}
                      />
                    </div>
                  </>
                )}

                {evidenceType === 'vehicle' && (
                  <>
                    <div className="form-row two-col">
                      <div>
                        <label>مدل وسیله نقلیه</label>
                        <input
                          type="text"
                          value={evidenceForm.vehicle_model}
                          onChange={(event) => updateEvidenceField('vehicle_model', event.target.value)}
                          disabled={submittingEvidence}
                          required
                        />
                      </div>
                      <div>
                        <label>رنگ وسیله نقلیه</label>
                        <input
                          type="text"
                          value={evidenceForm.vehicle_color}
                          onChange={(event) => updateEvidenceField('vehicle_color', event.target.value)}
                          disabled={submittingEvidence}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-row two-col">
                      <div>
                        <label>شماره پلاک (فقط یکی)</label>
                        <input
                          type="text"
                          value={evidenceForm.license_plate}
                          onChange={(event) => updateEvidenceField('license_plate', event.target.value)}
                          disabled={submittingEvidence}
                        />
                      </div>
                      <div>
                        <label>شماره سریال (فقط یکی)</label>
                        <input
                          type="text"
                          value={evidenceForm.serial_number}
                          onChange={(event) => updateEvidenceField('serial_number', event.target.value)}
                          disabled={submittingEvidence}
                        />
                      </div>
                    </div>
                  </>
                )}

                {evidenceType === 'identity_document' && (
                  <>
                    <div className="form-row">
                      <label>نام کامل صاحب مدرک</label>
                      <input
                        type="text"
                        value={evidenceForm.owner_full_name}
                        onChange={(event) => updateEvidenceField('owner_full_name', event.target.value)}
                        disabled={submittingEvidence}
                        required
                      />
                    </div>
                    <div className="form-row">
                      <div className="identity-header">
                        <label>مشخصات مدرک (کلید-مقدار)</label>
                        <button
                          type="button"
                          className="action-btn secondary"
                          onClick={() => setIdentityFields((prev) => [...prev, { key: '', value: '' }])}
                          disabled={submittingEvidence}
                        >
                          افزودن سطر
                        </button>
                      </div>
                      <div className="identity-grid">
                        {identityFields.map((item, index) => (
                          <div key={`identity-${index}`} className="identity-row">
                            <input
                              type="text"
                              placeholder="کلید"
                              value={item.key}
                              onChange={(event) =>
                                setIdentityFields((prev) =>
                                  prev.map((row, rowIndex) =>
                                    rowIndex === index ? { ...row, key: event.target.value } : row
                                  )
                                )
                              }
                              disabled={submittingEvidence}
                            />
                            <input
                              type="text"
                              placeholder="مقدار"
                              value={item.value}
                              onChange={(event) =>
                                setIdentityFields((prev) =>
                                  prev.map((row, rowIndex) =>
                                    rowIndex === index ? { ...row, value: event.target.value } : row
                                  )
                                )
                              }
                              disabled={submittingEvidence}
                            />
                            <button
                              type="button"
                              className="remove-row-btn"
                              onClick={() =>
                                setIdentityFields((prev) =>
                                  prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index)
                                )
                              }
                              disabled={submittingEvidence}
                            >
                              حذف
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="evidence-form-actions">
                  <button type="button" className="action-btn secondary" onClick={closeEvidenceModal}>
                    بستن
                  </button>
                  <button type="submit" className="action-btn primary" disabled={submittingEvidence}>
                    {submittingEvidence ? 'در حال ثبت...' : 'ثبت مدرک'}
                  </button>
                </div>
              </form>

              <div className="my-evidence-section">
                <h4>مدارک ثبت‌شده توسط شما در این پرونده</h4>
                {loadingMyEvidence ? (
                  <p className="hint">در حال بارگذاری مدارک...</p>
                ) : myEvidenceItems.length === 0 ? (
                  <p className="hint">هنوز مدرکی توسط شما برای این پرونده ثبت نشده است.</p>
                ) : (
                  <div className="my-evidence-list">
                    {myEvidenceItems.map((item) => (
                      <article key={item.id} className="my-evidence-item">
                        <strong>{item.title}</strong>
                        <span>{evidenceTypeLabelMap[item.type] || item.type}</span>
                        <span>{formatDate(item.created_at)}</span>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedModule>
  );
};

export default MyCases;
