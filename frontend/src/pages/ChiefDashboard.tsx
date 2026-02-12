import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CaseDossier from '../components/CaseDossier';
import ProtectedModule from '../components/ProtectedModule';
import { chiefApi, type ChiefCase, type ChiefCaseReport, type ChiefStats } from '../services';
import './ChiefDashboard.css';

type ChiefTab = 'critical' | 'stats';

const resolveTab = (pathname: string): ChiefTab =>
  pathname === '/chief/stats' ? 'stats' : 'critical';

const statusLabelMap: Record<string, string> = {
  WaitingChief: 'در انتظار تایید رئیس پلیس',
  InCourt: 'ارسال به دادگاه',
  Arrested: 'بازداشت انجام شده',
};

const severityLabelMap: Record<number, string> = {
  1: 'سطح ۳',
  2: 'سطح ۲',
  3: 'سطح ۱',
  4: 'بحرانی',
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

const ChiefDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ChiefTab>(() => resolveTab(location.pathname));
  const [cases, setCases] = useState<ChiefCase[]>([]);
  const [stats, setStats] = useState<ChiefStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<ChiefCaseReport | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setActiveTab(resolveTab(location.pathname));
  }, [location.pathname]);

  const requiredModuleId = activeTab === 'stats' ? 'chief-stats' : 'chief-critical';

  const criticalQueue = useMemo(
    () =>
      cases
        .filter((item) => item.status === 'WaitingChief' && item.severity === 4)
        .sort((a, b) => b.id - a.id),
    [cases]
  );

  const loadOverview = async () => {
    try {
      setLoading(true);
      const [allCases, aggregated] = await Promise.all([chiefApi.listCases(), chiefApi.getStats()]);
      setCases(allCases);
      setStats(aggregated);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت داده‌های داشبورد رئیس پلیس'));
    } finally {
      setLoading(false);
    }
  };

  const loadCaseReport = async (caseId: number) => {
    try {
      setLoadingReport(true);
      setSelectedCaseId(caseId);
      setSelectedReport(null);
      const report = await chiefApi.getCaseReport(caseId);
      setSelectedReport(report);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'دریافت گزارش جامع پرونده ناموفق بود.'));
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const applyChiefDecision = async (chiefConfirmed: boolean) => {
    if (!selectedReport || selectedCaseId === null) {
      setError('ابتدا یک پرونده را برای بررسی انتخاب کنید.');
      return;
    }
    const pendingDecisionIds = selectedReport.pending_chief_decision_ids || [];
    if (pendingDecisionIds.length === 0) {
      setError('برای این پرونده تصمیم pending رئیس پلیس پیدا نشد.');
      return;
    }
    const summary = decisionComment.trim();
    if (!chiefConfirmed && !summary) {
      setError('برای رد پرونده، توضیح رئیس پلیس الزامی است.');
      return;
    }

    try {
      setSubmittingDecision(true);
      setError('');
      setSuccess('');
      for (const decisionId of pendingDecisionIds) {
        await chiefApi.submitChiefDecision(decisionId, {
          chief_confirmed: chiefConfirmed,
          summary,
        });
      }
      setSuccess(
        chiefConfirmed
          ? `پرونده #${selectedCaseId} تایید شد و به دادگاه ارجاع گردید.`
          : `پرونده #${selectedCaseId} رد شد و به صف گروهبان بازگشت.`
      );
      setDecisionComment('');
      await loadOverview();
      setSelectedCaseId(null);
      setSelectedReport(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت تصمیم رئیس پلیس ناموفق بود.'));
    } finally {
      setSubmittingDecision(false);
    }
  };

  const renderStats = () => (
    <section className="chief-section">
      <div className="section-top">
        <h2>Stats Widget</h2>
      </div>
      {!stats ? (
        <div className="section-empty">اطلاعات آماری در دسترس نیست.</div>
      ) : (
        <div className="stats-grid">
          <article>
            <h3>پرونده‌های حل‌شده</h3>
            <strong>{stats.solved_cases}</strong>
          </article>
          <article>
            <h3>پرونده‌های فعال</h3>
            <strong>{stats.active_cases}</strong>
          </article>
          <article>
            <h3>کل پرونده‌ها</h3>
            <strong>{stats.total_cases}</strong>
          </article>
          <article>
            <h3>تعداد کارکنان</h3>
            <strong>{stats.staff_count}</strong>
          </article>
        </div>
      )}
    </section>
  );

  return (
    <ProtectedModule moduleId={requiredModuleId}>
      <div className="chief-page">
        <header className="chief-header">
          <div>
            <h1>داشبورد رئیس پلیس</h1>
            <p>بررسی پرونده‌های بحرانی و تایید/رد نهایی قبل از ارجاع به دادگاه</p>
          </div>
          <button type="button" onClick={loadOverview} disabled={loading}>
            {loading ? '...' : 'بارگذاری مجدد'}
          </button>
        </header>

        <nav className="chief-tabs">
          <button
            type="button"
            className={activeTab === 'critical' ? 'active' : ''}
            onClick={() => {
              setActiveTab('critical');
              navigate('/chief/critical-cases');
            }}
          >
            پرونده‌های بحرانی
          </button>
          <button
            type="button"
            className={activeTab === 'stats' ? 'active' : ''}
            onClick={() => {
              setActiveTab('stats');
              navigate('/chief/stats');
            }}
          >
            آمار کلان
          </button>
        </nav>

        {(error || success) && (
          <div className={`chief-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        {renderStats()}

        <section className="chief-section">
          <div className="section-top">
            <h2>Critical Queue</h2>
            <span>در انتظار رئیس پلیس: {criticalQueue.length}</span>
          </div>
          {loading ? (
            <div className="section-empty">در حال دریافت صف بحرانی...</div>
          ) : criticalQueue.length === 0 ? (
            <div className="section-empty">پرونده بحرانی در وضعیت WaitingChief وجود ندارد.</div>
          ) : (
            <div className="queue-grid">
              {criticalQueue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`queue-card ${selectedCaseId === item.id ? 'selected' : ''}`}
                  onClick={() => loadCaseReport(item.id)}
                >
                  <div className="queue-top">
                    <h3>
                      #{item.id} - {item.title}
                    </h3>
                    <span>{statusLabelMap[item.status] || item.status}</span>
                  </div>
                  <div className="queue-meta">
                    <span>{severityLabelMap[item.severity] || item.severity}</span>
                    <span>{formatDate(item.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedCaseId !== null ? (
          <section className="chief-section">
            <div className="section-top">
              <h2>Case Dossier</h2>
            </div>
            {loadingReport || !selectedReport ? (
              <div className="section-empty">در حال دریافت گزارش پرونده...</div>
            ) : (
              <CaseDossier
                report={selectedReport}
                actionPanel={
                  <div className="chief-action-panel">
                    <label htmlFor="chief-comment">نظر رئیس پلیس</label>
                    <textarea
                      id="chief-comment"
                      rows={4}
                      value={decisionComment}
                      onChange={(event) => setDecisionComment(event.target.value)}
                      placeholder="برای رد پرونده، توضیح الزامی است."
                    />
                    <div className="chief-action-buttons">
                      <button
                        type="button"
                        className="primary"
                        disabled={submittingDecision}
                        onClick={() => applyChiefDecision(true)}
                      >
                        {submittingDecision ? 'در حال ثبت...' : 'Confirm to Court'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={submittingDecision}
                        onClick={() => applyChiefDecision(false)}
                      >
                        {submittingDecision ? 'در حال ثبت...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                }
              />
            )}
          </section>
        ) : null}
      </div>
    </ProtectedModule>
  );
};

export default ChiefDashboard;
