import { useEffect, useMemo, useState } from 'react';
import CaseDossier from '../components/CaseDossier';
import ProtectedModule from '../components/ProtectedModule';
import { chiefApi, type ChiefCase, type ChiefCaseReport } from '../services';
import './ReportsPage.css';

const severityLabelMap: Record<number, string> = {
  1: 'سطح ۳',
  2: 'سطح ۲',
  3: 'سطح ۱',
  4: 'بحرانی',
};

const statusLabelMap: Record<string, string> = {
  Draft: 'پیش‌نویس',
  PendingCadet: 'در انتظار کارآموز',
  NeedsComplainantUpdate: 'نیازمند تکمیل شاکی',
  PendingOfficer: 'در انتظار تایید مافوق',
  Open: 'باز / در حال بررسی',
  WarrantPending: 'در انتظار تصمیم گروهبان',
  Arrested: 'بازداشت انجام شده',
  WaitingCaptain: 'در انتظار کاپیتان',
  WaitingChief: 'در انتظار رئیس پلیس',
  InCourt: 'ارسال به دادگاه',
  Closed: 'بسته',
  Void: 'باطل',
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    if ('data' in error) {
      const data = (error as { data?: unknown }).data;
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail.trim()) return detail;
      }
    }
  }
  return fallback;
};

const Reports = () => {
  const [cases, setCases] = useState<ChiefCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [report, setReport] = useState<ChiefCaseReport | null>(null);
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [error, setError] = useState('');

  const loadCases = async () => {
    try {
      setLoadingCases(true);
      const payload = await chiefApi.listCases();
      setCases(payload);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت لیست پرونده‌ها'));
    } finally {
      setLoadingCases(false);
    }
  };

  const loadReport = async (caseId: number) => {
    try {
      setLoadingReport(true);
      setSelectedCaseId(caseId);
      setReport(null);
      const payload = await chiefApi.getCaseReport(caseId);
      setReport(payload);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت گزارش جامع پرونده'));
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    void loadCases();
  }, []);

  const statusOptions = useMemo(
    () => ['all', ...Array.from(new Set(cases.map((item) => item.status)))],
    [cases]
  );

  const filteredCases = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return cases
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (severityFilter !== 'all' && String(item.severity) !== severityFilter) return false;
        if (!text) return true;
        const haystack = `${item.id} ${item.title} ${item.description} ${item.location}`.toLowerCase();
        return haystack.includes(text);
      })
      .sort((a, b) => b.id - a.id);
  }, [cases, searchText, severityFilter, statusFilter]);

  return (
    <ProtectedModule moduleId="reports">
      <div className="reports-page">
        <header className="reports-header">
          <div>
            <h1>گزارش‌گیری کلی</h1>
            <p>گزارش جامع هر پرونده برای قاضی، کاپیتان و رئیس پلیس</p>
          </div>
          <button type="button" onClick={loadCases} disabled={loadingCases}>
            {loadingCases ? '...' : 'بارگذاری مجدد'}
          </button>
        </header>

        {error ? <div className="reports-feedback error">{error}</div> : null}

        <section className="reports-filters">
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="جستجو با عنوان، شناسه، توضیحات یا مکان"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'همه وضعیت‌ها' : statusLabelMap[option] || option}
              </option>
            ))}
          </select>
          <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
            <option value="all">همه سطوح جرم</option>
            <option value="1">سطح ۳</option>
            <option value="2">سطح ۲</option>
            <option value="3">سطح ۱</option>
            <option value="4">بحرانی</option>
          </select>
        </section>

        <div className="reports-layout">
          <aside className="reports-sidebar">
            <div className="sidebar-top">
              <h2>پرونده‌ها</h2>
              <span>{filteredCases.length}</span>
            </div>
            {loadingCases ? (
              <div className="reports-empty">در حال دریافت پرونده‌ها...</div>
            ) : filteredCases.length === 0 ? (
              <div className="reports-empty">پرونده‌ای با فیلتر فعلی یافت نشد.</div>
            ) : (
              <div className="reports-case-list">
                {filteredCases.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`reports-case-item ${selectedCaseId === item.id ? 'selected' : ''}`}
                    onClick={() => loadReport(item.id)}
                  >
                    <div className="reports-case-top">
                      <h3>
                        #{item.id} - {item.title}
                      </h3>
                      <span>{statusLabelMap[item.status] || item.status}</span>
                    </div>
                    <div className="reports-case-meta">
                      <span>{severityLabelMap[item.severity] || item.severity}</span>
                      <span>{formatDate(item.updated_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <main className="reports-main">
            {selectedCaseId === null ? (
              <div className="reports-empty">برای مشاهده گزارش، یک پرونده را از لیست انتخاب کنید.</div>
            ) : loadingReport || !report ? (
              <div className="reports-empty">در حال بارگذاری گزارش پرونده...</div>
            ) : (
              <CaseDossier report={report} />
            )}
          </main>
        </div>
      </div>
    </ProtectedModule>
  );
};

export default Reports;
