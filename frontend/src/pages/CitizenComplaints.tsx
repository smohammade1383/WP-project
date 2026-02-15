import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, complaintsApi, type Complaint } from '../services';
import type { ComplaintAttachment } from '../services/complaints.api';
import './CitizenComplaints.css';

type EditFormState = {
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
};

const statusLabelMap: Record<string, string> = {
  submitted: 'در صف بررسی',
  returned: 'نیاز به اصلاح',
  approved: 'تایید شده',
  rejected: 'رد شده',
  void: 'باطل شده',
};

const statusClassMap: Record<string, string> = {
  submitted: 'status-submitted',
  returned: 'status-returned',
  approved: 'status-approved',
  rejected: 'status-rejected',
  void: 'status-void',
};

const toLocalDateTime = (iso: string): string => {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toIsoString = (localDateTime: string): string => {
  return new Date(localDateTime).toISOString();
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

const CitizenComplaints = () => {
  const navigate = useNavigate();
  const currentUser = authService.getUserData();
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingItem, setEditingItem] = useState<Complaint | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [existingAttachments, setExistingAttachments] = useState<ComplaintAttachment[]>([]);
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [removeAttachmentIds, setRemoveAttachmentIds] = useState<number[]>([]);
  const [showEditAttachmentModal, setShowEditAttachmentModal] = useState(false);
  const [editAttachmentDraft, setEditAttachmentDraft] = useState<File[]>([]);
  const [editForm, setEditForm] = useState<EditFormState>({
    title: '',
    description: '',
    location: '',
    incident_datetime: '',
  });
  const [secondaryRequestTarget, setSecondaryRequestTarget] = useState<Complaint | null>(null);
  const [secondaryRequestIds, setSecondaryRequestIds] = useState('');
  const [secondaryRequestLoading, setSecondaryRequestLoading] = useState(false);

  const loadComplaints = async () => {
    try {
      setLoading(true);
      const data = await complaintsApi.listMine();
      setItems(data);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت لیست شکایات'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  useEffect(() => {
    if (!editingItem && !secondaryRequestTarget && !showEditAttachmentModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingItem, secondaryRequestTarget, showEditAttachmentModal]);

  const sortedItems = useMemo(() => {
    return [...items].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [items]);

  const isSubmitter = (item: Complaint): boolean => {
    return Boolean(currentUser?.id && item.submitter?.id === currentUser.id);
  };

  const canEdit = (item: Complaint): boolean => {
    if (!isSubmitter(item)) return false;
    if (item.status !== 'returned' && item.status !== 'submitted') return false;
    return item.invalid_attempt_count < 3;
  };

  const openEdit = (item: Complaint) => {
    setEditingItem(item);
    setEditForm({
      title: item.title,
      description: item.description,
      location: item.location,
      incident_datetime: toLocalDateTime(item.incident_datetime),
    });
    setExistingAttachments(item.attachments || []);
    setNewAttachments([]);
    setRemoveAttachmentIds([]);
    setEditAttachmentDraft([]);
    setShowEditAttachmentModal(false);
    setError('');
    setSuccess('');
  };

  const closeEdit = () => {
    setEditingItem(null);
    setExistingAttachments([]);
    setNewAttachments([]);
    setRemoveAttachmentIds([]);
    setEditAttachmentDraft([]);
    setShowEditAttachmentModal(false);
  };

  const closeEditAttachmentModal = () => {
    setShowEditAttachmentModal(false);
    setEditAttachmentDraft([]);
  };

  const addDraftAttachmentsToEdit = () => {
    if (editAttachmentDraft.length === 0) {
      setError('حداقل یک فایل برای افزودن مدرک انتخاب کنید.');
      return;
    }
    setNewAttachments((prev) => [...prev, ...editAttachmentDraft]);
    closeEditAttachmentModal();
  };

  const toggleExistingAttachmentForRemoval = (attachmentId: number) => {
    setRemoveAttachmentIds((prev) =>
      prev.includes(attachmentId) ? prev.filter((id) => id !== attachmentId) : [...prev, attachmentId]
    );
  };

  const removeNewAttachmentAt = (index: number) => {
    setNewAttachments((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingItem) return;

    if (!editForm.title.trim() || !editForm.description.trim() || !editForm.location.trim()) {
      setError('تمام فیلدهای فرم ویرایش الزامی هستند.');
      return;
    }

    try {
      setSavingEdit(true);
      setError('');
      const payload = new FormData();
      payload.append('title', editForm.title.trim());
      payload.append('description', editForm.description.trim());
      payload.append('location', editForm.location.trim());
      payload.append('incident_datetime', toIsoString(editForm.incident_datetime));
      newAttachments.forEach((file) => payload.append('attachment_files', file));
      removeAttachmentIds.forEach((id) => payload.append('remove_attachment_ids', String(id)));

      await complaintsApi.update(editingItem.id, payload);
      setSuccess('شکایت با موفقیت اصلاح و دوباره ارسال شد.');
      closeEdit();
      await loadComplaints();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ویرایش شکایت با خطا مواجه شد.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const reasonText = (item: Complaint): string => {
    const message = item.latest_review_message?.trim();
    if (message) return message;
    if (item.status === 'returned') return 'شکایت نیاز به تکمیل اطلاعات دارد.';
    if (item.status === 'rejected') return 'شکایت رد شده است.';
    return '-';
  };

  const remainingAttempts = (item: Complaint): number => {
    return Math.max(0, 3 - item.invalid_attempt_count);
  };

  const parseUserIds = (raw: string): number[] => {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  };

  const openSecondaryRequest = (item: Complaint) => {
    setSecondaryRequestTarget(item);
    setSecondaryRequestIds('');
    setError('');
    setSuccess('');
  };

  const closeSecondaryRequest = () => {
    setSecondaryRequestTarget(null);
    setSecondaryRequestIds('');
  };

  const submitSecondaryRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!secondaryRequestTarget) return;
    const ids = parseUserIds(secondaryRequestIds);
    if (ids.length === 0) {
      setError('برای درخواست شاکی فرعی، شناسه کاربری معتبر وارد کنید.');
      return;
    }

    try {
      setSecondaryRequestLoading(true);
      setError('');
      await complaintsApi.requestSecondaryComplainants(secondaryRequestTarget.id, {
        complainant_ids: ids,
      });
      setSuccess('درخواست بررسی شاکی(های) فرعی برای کارآموز ثبت شد.');
      closeSecondaryRequest();
      await loadComplaints();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت درخواست شاکی فرعی با خطا مواجه شد.'));
    } finally {
      setSecondaryRequestLoading(false);
    }
  };

  return (
    <div className="citizen-complaints-page">
      <div className="citizen-complaints-header">
        <div>
          <h1>پیگیری شکایات</h1>
          <p>وضعیت شکایات ثبت‌شده خود را مشاهده و در صورت نیاز اصلاح کنید.</p>
        </div>
        <button
          type="button"
          className="new-complaint-btn"
          onClick={() => navigate('/citizen/complaints/new')}
        >
          ثبت شکایت جدید
        </button>
      </div>

      {(error || success) && (
        <div className={`citizen-feedback ${error ? 'error' : 'success'}`}>
          {error || success}
        </div>
      )}

      {loading ? (
        <div className="citizen-loading">در حال بارگذاری شکایات...</div>
      ) : sortedItems.length === 0 ? (
        <div className="citizen-empty">
          <h3>هنوز شکایتی ثبت نکرده‌اید.</h3>
          <p>برای شروع، دکمه «ثبت شکایت جدید» را بزنید.</p>
        </div>
      ) : (
        <div className="complaints-grid">
          {sortedItems.map((item) => (
            <article key={item.id} className="complaint-card">
              <div className="complaint-card-header">
                <h3>{item.title}</h3>
                <span className={`status-badge ${statusClassMap[item.status] || ''}`}>
                  {statusLabelMap[item.status] || item.status}
                </span>
              </div>

              <p className="complaint-description">{item.description}</p>

              <div className="complaint-meta">
                <div>
                  <span>مکان</span>
                  <strong>{item.location}</strong>
                </div>
                <div>
                  <span>زمان وقوع</span>
                  <strong>{formatDate(item.incident_datetime)}</strong>
                </div>
                <div>
                  <span>تعداد برگشت</span>
                  <strong>{item.invalid_attempt_count} / 3</strong>
                </div>
                <div>
                  <span>فرصت باقی‌مانده تا ابطال</span>
                  <strong>{remainingAttempts(item)} از 3</strong>
                </div>
                <div>
                  <span>کد پرونده</span>
                  <strong>{item.case ? `#${item.case}` : 'تشکیل نشده'}</strong>
                </div>
                <div>
                  <span>تعداد مدارک ضمیمه</span>
                  <strong>{item.attachments.length}</strong>
                </div>
              </div>

              {remainingAttempts(item) <= 1 && item.status !== 'void' && (
                <div className="complaint-risk">
                  هشدار: با {remainingAttempts(item)} تلاش باقی‌مانده، در صورت ثبت اطلاعات ناقص شکایت باطل می‌شود.
                </div>
              )}

              {(item.status === 'returned' || item.status === 'rejected') && (
                <div className="complaint-reason">
                  <span>علت:</span>
                  <p>{reasonText(item)}</p>
                </div>
              )}

              <div className="complaint-actions">
                <div className="complaint-actions-row">
                  {canEdit(item) ? (
                    <button type="button" className="edit-btn" onClick={() => openEdit(item)}>
                      ویرایش شکایت و مدارک
                    </button>
                  ) : (
                    <span className="read-only-note">
                      {item.status === 'approved' || item.status === 'rejected' || item.status === 'void'
                        ? 'این شکایت نهایی شده و قابل ویرایش نیست.'
                        : 'فقط ثبت‌کننده اصلی امکان اصلاح دارد.'}
                    </span>
                  )}
                  {isSubmitter(item) && item.status !== 'void' && (
                    <button
                      type="button"
                      className="secondary-btn-inline"
                      onClick={() => openSecondaryRequest(item)}
                    >
                      درخواست شاکی فرعی
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editingItem && (
        <div className="edit-modal-overlay" onClick={closeEdit}>
          <div className="edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="edit-modal-header">
              <h3>ویرایش شکایت</h3>
              <button type="button" onClick={closeEdit} aria-label="بستن">
                ×
              </button>
            </div>

            <form onSubmit={submitEdit} className="edit-form">
              <label htmlFor="edit-title">عنوان</label>
              <input
                id="edit-title"
                type="text"
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, title: event.target.value }))
                }
                disabled={savingEdit}
                required
              />

              <label htmlFor="edit-description">شرح شکایت</label>
              <textarea
                id="edit-description"
                rows={5}
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, description: event.target.value }))
                }
                disabled={savingEdit}
                required
              />

              <label htmlFor="edit-location">مکان</label>
              <input
                id="edit-location"
                type="text"
                value={editForm.location}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, location: event.target.value }))
                }
                disabled={savingEdit}
                required
              />

              <label htmlFor="edit-incident-datetime">زمان وقوع</label>
              <input
                id="edit-incident-datetime"
                type="datetime-local"
                value={editForm.incident_datetime}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, incident_datetime: event.target.value }))
                }
                disabled={savingEdit}
                required
              />

              <div className="edit-attachment-header">
                <label>مدارک شکایت</label>
                <button
                  type="button"
                  className="edit-attachment-add-btn"
                  onClick={() => {
                    setError('');
                    setEditAttachmentDraft([]);
                    setShowEditAttachmentModal(true);
                  }}
                  disabled={savingEdit}
                >
                  ثبت مدرک جدید
                </button>
              </div>

              <div className="edit-attachment-list">
                {existingAttachments.map((attachment) => {
                  const markedForRemoval = removeAttachmentIds.includes(attachment.id);
                  return (
                    <div
                      key={`existing-attachment-${attachment.id}`}
                      className={`edit-attachment-item ${markedForRemoval ? 'pending-remove' : ''}`}
                    >
                      <span>{attachment.original_name}</span>
                      <button
                        type="button"
                        className="edit-attachment-toggle-btn"
                        onClick={() => toggleExistingAttachmentForRemoval(attachment.id)}
                        disabled={savingEdit}
                      >
                        {markedForRemoval ? 'بازگردانی' : 'حذف'}
                      </button>
                    </div>
                  );
                })}

                {newAttachments.map((attachment, index) => (
                  <div key={`new-attachment-${attachment.name}-${index}`} className="edit-attachment-item is-new">
                    <span>{attachment.name}</span>
                    <button
                      type="button"
                      className="edit-attachment-toggle-btn"
                      onClick={() => removeNewAttachmentAt(index)}
                      disabled={savingEdit}
                    >
                      حذف
                    </button>
                  </div>
                ))}

                {existingAttachments.length === 0 && newAttachments.length === 0 && (
                  <div className="edit-attachment-empty">هنوز مدرکی برای این شکایت ثبت نشده است.</div>
                )}
              </div>

              <div className="edit-form-actions">
                <button type="button" className="cancel-btn" onClick={closeEdit} disabled={savingEdit}>
                  انصراف
                </button>
                <button type="submit" className="save-btn" disabled={savingEdit}>
                  {savingEdit ? 'در حال ارسال...' : 'ثبت اصلاحات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingItem && showEditAttachmentModal && (
        <div className="edit-attachment-modal-overlay" onClick={closeEditAttachmentModal}>
          <div className="edit-attachment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="edit-attachment-modal-header">
              <h3>افزودن مدرک جدید به شکایت</h3>
              <button type="button" onClick={closeEditAttachmentModal} aria-label="بستن">
                ×
              </button>
            </div>
            <div className="edit-attachment-modal-body">
              <label htmlFor="edit-attachment-modal-input">انتخاب فایل(ها)</label>
              <input
                id="edit-attachment-modal-input"
                type="file"
                multiple
                onChange={(event) => setEditAttachmentDraft(Array.from(event.target.files || []))}
              />
              {editAttachmentDraft.length > 0 && (
                <div className="edit-attachment-draft-list">
                  {editAttachmentDraft.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${index}`}>{file.name}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="edit-attachment-modal-actions">
              <button type="button" className="cancel-btn" onClick={closeEditAttachmentModal}>
                انصراف
              </button>
              <button type="button" className="save-btn" onClick={addDraftAttachmentsToEdit}>
                افزودن به لیست مدارک
              </button>
            </div>
          </div>
        </div>
      )}

      {secondaryRequestTarget && (
        <div className="edit-modal-overlay" onClick={closeSecondaryRequest}>
          <div className="edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="edit-modal-header">
              <h3>درخواست شاکی فرعی برای شکایت #{secondaryRequestTarget.id}</h3>
              <button type="button" onClick={closeSecondaryRequest} aria-label="بستن">
                ×
              </button>
            </div>
            <form onSubmit={submitSecondaryRequest} className="edit-form">
              <label htmlFor="secondary-ids">شناسه کاربران (با کاما جدا کنید)</label>
              <input
                id="secondary-ids"
                type="text"
                placeholder="مثال: 12, 18"
                value={secondaryRequestIds}
                onChange={(event) => setSecondaryRequestIds(event.target.value)}
                disabled={secondaryRequestLoading}
                required
              />
              <div className="edit-form-actions">
                <button type="button" className="cancel-btn" onClick={closeSecondaryRequest}>
                  انصراف
                </button>
                <button type="submit" className="save-btn" disabled={secondaryRequestLoading}>
                  {secondaryRequestLoading ? 'در حال ثبت...' : 'ارسال درخواست'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CitizenComplaints;
