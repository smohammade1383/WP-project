import { useEffect, useMemo, useState } from 'react';
import { authService, peopleApi, type WantedPerson } from '../services';
import './MostWanted.css';

const severityLabel = (level: number) => {
  switch (level) {
    case 4:
      return 'بحرانی';
    case 3:
      return 'سطح ۱';
    case 2:
      return 'سطح ۲';
    case 1:
      return 'سطح ۳';
    default:
      return 'نامشخص';
  }
};

const severityClass = (level: number) => {
  switch (level) {
    case 4:
      return 'critical';
    case 3:
      return 'level-1';
    case 2:
      return 'level-2';
    case 1:
      return 'level-3';
    default:
      return 'unknown';
  }
};

const formatNumber = (value: number) => value.toLocaleString('fa-IR');

const getDisplayName = (person: WantedPerson['suspect']) => {
  if (person.full_name && person.full_name.trim()) return person.full_name;
  const fallback = `${person.first_name || ''} ${person.last_name || ''}`.trim();
  return fallback || person.username;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
};

const MostWanted = () => {
  const [wanted, setWanted] = useState<WantedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<number | 'all'>('all');
  const [minDays, setMinDays] = useState('');
  const [selectedSuspectId, setSelectedSuspectId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WantedPerson | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [reportTarget, setReportTarget] = useState<WantedPerson | null>(null);
  const [reportDescription, setReportDescription] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');
  const isModalOpen = selectedSuspectId !== null;
  const isReportModalOpen = reportTarget !== null;

  useEffect(() => {
    const fetchWanted = async () => {
      try {
        setLoading(true);
        const data = await peopleApi.getWantedList();
        setWanted(data);
        setError('');
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'خطا در دریافت لیست افراد تحت پیگیری شدید'));
      } finally {
        setLoading(false);
      }
    };

    fetchWanted();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const minDaysValue = minDays ? Number(minDays) : 0;

    return wanted.filter((item) => {
      const name = getDisplayName(item.suspect).toLowerCase();
      const matchesQuery =
        !term ||
        name.includes(term) ||
        item.suspect.national_id.includes(term) ||
        item.suspect.username.toLowerCase().includes(term);

      const matchesSeverity = severity === 'all' || item.case_severity === severity;
      const matchesDays = minDaysValue === 0 || item.wanted_days >= minDaysValue;

      return matchesQuery && matchesSeverity && matchesDays;
    });
  }, [wanted, query, severity, minDays]);

  useEffect(() => {
    if (!isModalOpen || selectedSuspectId === null) return;

    const fetchDetail = async () => {
      try {
        setDetailLoading(true);
        setDetailError('');
        const result = await peopleApi.getWantedDetail(selectedSuspectId);
        setDetail(result);
      } catch (err: unknown) {
        setDetailError(getErrorMessage(err, 'خطا در دریافت اطلاعات مظنون'));
      } finally {
        setDetailLoading(false);
      }
    };

    fetchDetail();
  }, [isModalOpen, selectedSuspectId]);

  useEffect(() => {
    if (!isModalOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedSuspectId(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isModalOpen]);

  useEffect(() => {
    if (!isReportModalOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeReportModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isReportModalOpen]);

  const openReportModal = (item: WantedPerson) => {
    if (!authService.isAuthenticated()) {
      window.alert('برای ارسال گزارش ابتدا وارد حساب کاربری شوید.');
      return;
    }
    setReportTarget(item);
    setReportDescription('');
    setReportError('');
    setReportSuccess('');
  };

  const closeReportModal = () => {
    setReportTarget(null);
    setReportDescription('');
    setReportError('');
    setReportSuccess('');
  };

  const handleSubmitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportTarget) return;

    const description = reportDescription.trim();
    if (description.length < 10) {
      setReportError('متن گزارش باید حداقل ۱۰ کاراکتر باشد.');
      return;
    }

    try {
      setReportLoading(true);
      setReportError('');
      await peopleApi.submitTip({
        suspect_profile: reportTarget.id,
        description,
      });
      setReportSuccess('گزارش شما ثبت شد و برای بررسی افسر ارسال شد.');
      setReportDescription('');
    } catch (err: unknown) {
      setReportError(getErrorMessage(err, 'ثبت گزارش با خطا مواجه شد.'));
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="most-wanted-page">
      <div className="most-wanted-header">
        <div>
          <h1>تحت پیگیری شدید</h1>
          <p>لیست مظنونان و مجرمان تحت تعقیب با جزئیات کامل</p>
        </div>
        <div className="wanted-count">
          <span>تعداد کل</span>
          <strong>{formatNumber(wanted.length)}</strong>
        </div>
      </div>

      <div className="most-wanted-filters">
        <div className="filter-group">
          <label htmlFor="wanted-search">جستجو</label>
          <input
            id="wanted-search"
            type="text"
            placeholder="نام، کد ملی یا نام کاربری"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="wanted-severity">شدت جرم</label>
          <select
            id="wanted-severity"
            value={severity}
            onChange={(event) =>
              setSeverity(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
          >
            <option value="all">همه</option>
            <option value="4">بحرانی</option>
            <option value="3">سطح ۱</option>
            <option value="2">سطح ۲</option>
            <option value="1">سطح ۳</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="wanted-days">حداقل روز تعقیب</label>
          <input
            id="wanted-days"
            type="number"
            min="0"
            placeholder="مثلاً 30"
            value={minDays}
            onChange={(event) => setMinDays(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="wanted-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="wanted-card skeleton">
              <div className="wanted-photo skeleton-block" />
              <div className="wanted-body">
                <div className="skeleton-line" />
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="wanted-error">
          <h3>خطا</h3>
          <p>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="wanted-empty">
          <div className="empty-icon">🔍</div>
          <h2>موردی یافت نشد</h2>
          <p>با فیلترهای فعلی هیچ فردی در لیست وجود ندارد.</p>
        </div>
      ) : (
        <div className="wanted-grid">
              {filtered.map((item) => (
            <div key={item.id} className={`wanted-card ${severityClass(item.case_severity)}`}>
              <div className="wanted-photo">
                {item.public_photo ? (
                  <img src={item.public_photo} alt={getDisplayName(item.suspect)} />
                ) : (
                  <div className="photo-placeholder">
                    {getDisplayName(item.suspect).slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="wanted-body">
                <div className="wanted-title">
                  <h3>{getDisplayName(item.suspect)}</h3>
                  <span className={`severity-tag ${severityClass(item.case_severity)}`}>
                    {severityLabel(item.case_severity)}
                  </span>
                </div>
                <p className="wanted-details">{item.public_details || 'جزئیات عمومی ثبت نشده است.'}</p>
                <div className="wanted-meta">
                  <div>
                    <span>روزهای تعقیب</span>
                    <strong>{formatNumber(item.wanted_days)}</strong>
                  </div>
                  <div>
                    <span>امتیاز تعقیب</span>
                    <strong>{formatNumber(item.ranking_score)}</strong>
                  </div>
                  <div>
                    <span>مبلغ پاداش (ریال)</span>
                    <strong>{formatNumber(item.reward_amount)}</strong>
                  </div>
                </div>
                <div className="wanted-footer">
                  <span>کد ملی: {item.suspect.national_id}</span>
                  <span>پرونده #{item.case_id}</span>
                </div>
                <div className="wanted-actions">
                  <button
                    className="wanted-report-btn"
                    onClick={() => openReportModal(item)}
                  >
                    ارسال گزارش
                  </button>
                  <button
                    className="wanted-detail-btn"
                    onClick={() => setSelectedSuspectId(item.suspect.id)}
                  >
                    مشاهده جزئیات
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="wanted-modal-overlay" onClick={() => setSelectedSuspectId(null)}>
          <div
            className="wanted-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="wanted-modal-header">
              <div className="modal-header-text">
                <span>تحت پیگیری شدید</span>
                <h2>جزئیات مظنون</h2>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedSuspectId(null)}
                aria-label="بستن"
              >
                ×
              </button>
            </div>

            {detailLoading ? (
              <div className="wanted-modal-body">
                <div className="modal-skeleton" />
              </div>
            ) : detailError ? (
              <div className="wanted-modal-body">
                <div className="wanted-error">
                  <h3>خطا</h3>
                  <p>{detailError}</p>
                </div>
              </div>
            ) : detail ? (
              <div className="wanted-modal-body">
                <div className="modal-layout">
                  <div className="modal-sidebar">
                    <div className="profile-card">
                      <div className="profile-photo">
                        {detail.public_photo ? (
                          <img src={detail.public_photo} alt={getDisplayName(detail.suspect)} />
                        ) : (
                          <div className="photo-placeholder">
                            {getDisplayName(detail.suspect).slice(0, 1)}
                          </div>
                        )}
                      </div>
                      <div className="profile-meta">
                        <h3>{getDisplayName(detail.suspect)}</h3>
                        <p>@{detail.suspect.username}</p>
                        <div className="profile-badges">
                          <span className={`severity-badge ${severityClass(detail.case_severity)}`}>
                            {severityLabel(detail.case_severity)}
                          </span>
                          <span className={`status-badge ${detail.severe_tracking ? 'severe' : 'normal'}`}>
                            {detail.severe_tracking ? 'تحت پیگیری شدید' : 'عادی'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="profile-stats">
                      <div>
                        <span>روزهای تعقیب</span>
                        <strong>{formatNumber(detail.wanted_days)}</strong>
                      </div>
                      <div>
                        <span>امتیاز تعقیب</span>
                        <strong>{formatNumber(detail.ranking_score)}</strong>
                      </div>
                      <div>
                        <span>پاداش (ریال)</span>
                        <strong>{formatNumber(detail.reward_amount)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="modal-content">
                    <div className="detail-summary">
                      <h4>شرح مختصر</h4>
                      <p>{detail.public_details || 'جزئیات عمومی ثبت نشده است.'}</p>
                    </div>

                    <div className="detail-grid">
                      <div>
                        <span>کد ملی</span>
                        <strong>{detail.suspect.national_id}</strong>
                      </div>
                      <div>
                        <span>پرونده مرتبط</span>
                        <strong>#{detail.case_id}</strong>
                      </div>
                      <div>
                        <span>سطح جرم</span>
                        <strong>{severityLabel(detail.case_severity)}</strong>
                      </div>
                      <div>
                        <span>تاریخ شروع تعقیب</span>
                        <strong>{new Date(detail.wanted_since).toLocaleDateString('fa-IR')}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {isReportModalOpen && reportTarget && (
        <div className="report-modal-overlay" onClick={closeReportModal}>
          <div
            className="report-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="report-modal-header">
              <h3>ارسال گزارش مردمی</h3>
              <button
                type="button"
                className="report-modal-close"
                onClick={closeReportModal}
                aria-label="بستن"
              >
                ×
              </button>
            </div>

            <div className="report-modal-target">
              <span>مظنون:</span>
              <strong>{getDisplayName(reportTarget.suspect)}</strong>
              <span>پرونده:</span>
              <strong>#{reportTarget.case_id}</strong>
            </div>

            <form onSubmit={handleSubmitReport} className="report-form">
              <label htmlFor="report-description">شرح گزارش</label>
              <textarea
                id="report-description"
                rows={5}
                value={reportDescription}
                onChange={(event) => setReportDescription(event.target.value)}
                placeholder="جزئیات اطلاعاتی که درباره این مظنون دارید را وارد کنید..."
                disabled={reportLoading}
              />

              {reportError && <p className="report-feedback error">{reportError}</p>}
              {reportSuccess && <p className="report-feedback success">{reportSuccess}</p>}

              <div className="report-form-actions">
                <button
                  type="button"
                  className="report-cancel-btn"
                  onClick={closeReportModal}
                  disabled={reportLoading}
                >
                  انصراف
                </button>
                <button type="submit" className="report-submit-btn" disabled={reportLoading}>
                  {reportLoading ? 'در حال ارسال...' : 'ثبت گزارش'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MostWanted;
