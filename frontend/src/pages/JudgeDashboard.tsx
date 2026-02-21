import { useEffect, useMemo, useState } from 'react';
import CaseDossier from '../components/CaseDossier';
import ProtectedModule from '../components/ProtectedModule';
import { judgeApi, type ChiefCaseReport, type JudgeCase } from '../services';
import './JudgeDashboard.css';

const severityLabelMap: Record<number, string> = {
  1: 'سطح ۳',
  2: 'سطح ۲',
  3: 'سطح ۱',
  4: 'بحرانی',
};

const statusLabelMap: Record<string, string> = {
  InCourt: 'در انتظار حکم قاضی',
  Closed: 'مختومه',
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

type SuspectOption = {
  id: number;
  username: string;
  nationalId: string;
};

const extractTriedDefendantIds = (report: ChiefCaseReport | null): Set<number> => {
  const tried = new Set<number>();
  if (!report) return tried;
  for (const trial of report.trials) {
    const defendant = Number(trial.defendant);
    if (Number.isInteger(defendant) && defendant > 0) {
      tried.add(defendant);
    }
  }
  return tried;
};

const extractSuspectOptions = (report: ChiefCaseReport | null): SuspectOption[] => {
  if (!report) return [];
  const triedDefendantIds = extractTriedDefendantIds(report);
  const options: SuspectOption[] = [];
  const seen = new Set<number>();
  for (const profile of report.suspect_profiles) {
    const rawSuspect = profile.suspect as Record<string, unknown> | undefined;
    if (!rawSuspect) continue;
    const id = Number(rawSuspect.id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    if (triedDefendantIds.has(id)) continue;
    seen.add(id);
    options.push({
      id,
      username: typeof rawSuspect.username === 'string' ? rawSuspect.username : `user-${id}`,
      nationalId:
        typeof rawSuspect.national_id === 'string' ? rawSuspect.national_id : '-',
    });
  }
  return options;
};

const JudgeDashboard = () => {
  const [cases, setCases] = useState<JudgeCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [report, setReport] = useState<ChiefCaseReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [submittingVerdict, setSubmittingVerdict] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedDefendant, setSelectedDefendant] = useState<string>('');
  const [verdict, setVerdict] = useState<'innocent' | 'guilty'>('innocent');
  const [verdictNote, setVerdictNote] = useState('');
  const [punishmentTitle, setPunishmentTitle] = useState('');
  const [punishmentDescription, setPunishmentDescription] = useState('');

  const inCourtQueue = useMemo(
    () => cases.filter((item) => item.status === 'InCourt').sort((a, b) => b.id - a.id),
    [cases]
  );

  const suspectOptions = useMemo(() => extractSuspectOptions(report), [report]);

  const loadCases = async () => {
    try {
      setLoading(true);
      const allCases = await judgeApi.listCases();
      setCases(allCases);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت پرونده‌های قابل محاکمه'));
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (caseId: number) => {
    try {
      setLoadingReport(true);
      setSelectedCaseId(caseId);
      setReport(null);
      const data = await judgeApi.getCaseReport(caseId);
      setReport(data);
      setError('');
      setSelectedDefendant('');
      setVerdict('innocent');
      setVerdictNote('');
      setPunishmentTitle('');
      setPunishmentDescription('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت گزارش جامع پرونده'));
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    void loadCases();
  }, []);

  const submitTrial = async () => {
    if (selectedCaseId === null) {
      setError('ابتدا یک پرونده انتخاب کنید.');
      return;
    }
    if (!selectedDefendant) {
      setError('انتخاب متهم الزامی است.');
      return;
    }
    if (!verdictNote.trim()) {
      setError('ثبت توضیح رای (verdict note) الزامی است.');
      return;
    }
    if (verdict === 'guilty' && (!punishmentTitle.trim() || !punishmentDescription.trim())) {
      setError('برای حکم گناهکار، عنوان و توضیح مجازات الزامی است.');
      return;
    }

    try {
      setSubmittingVerdict(true);
      setError('');
      setSuccess('');

      const payload: {
        case: number;
        verdict: 'innocent' | 'guilty';
        verdict_note: string;
        defendant?: number;
        punishment_title?: string;
        punishment_description?: string;
      } = {
        case: selectedCaseId,
        verdict,
        verdict_note: verdictNote.trim(),
        defendant: Number(selectedDefendant),
      };
      if (verdict === 'guilty') {
        payload.punishment_title = punishmentTitle.trim();
        payload.punishment_description = punishmentDescription.trim();
      }

      await judgeApi.createTrial(payload);
      const allCases = await judgeApi.listCases();
      setCases(allCases);
      const updatedCase = allCases.find((item) => item.id === selectedCaseId);
      if (updatedCase && updatedCase.status === 'InCourt') {
        await loadReport(selectedCaseId);
        setSuccess(`رای متهم ثبت شد. این پرونده هنوز متهم قضاوت‌نشده دارد.`);
      } else {
        setSuccess(`رای نهایی برای پرونده #${selectedCaseId} با موفقیت ثبت شد و پرونده مختومه شد.`);
        setSelectedCaseId(null);
        setReport(null);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت رای دادگاه ناموفق بود.'));
    } finally {
      setSubmittingVerdict(false);
    }
  };

  return (
    <ProtectedModule moduleId="judge-bench">
      <div className="judge-page">
        <header className="judge-header">
          <div>
            <h1>میز قضاوت</h1>
            <p>بررسی پرونده‌های ارجاع‌شده به دادگاه و ثبت رای نهایی قاضی</p>
          </div>
          <button type="button" onClick={loadCases} disabled={loading}>
            {loading ? '...' : 'بارگذاری مجدد'}
          </button>
        </header>

        {(error || success) && (
          <div className={`judge-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        <section className="judge-section">
          <div className="section-top">
            <h2>صف محاکمه (InCourt)</h2>
            <span>{inCourtQueue.length} پرونده</span>
          </div>
          {loading ? (
            <div className="section-empty">در حال دریافت پرونده‌های در انتظار محاکمه...</div>
          ) : inCourtQueue.length === 0 ? (
            <div className="section-empty">پرونده‌ای برای محاکمه در صف وجود ندارد.</div>
          ) : (
            <div className="queue-grid">
              {inCourtQueue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`queue-card ${selectedCaseId === item.id ? 'selected' : ''}`}
                  onClick={() => loadReport(item.id)}
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

        {selectedCaseId !== null && (
          <section className="judge-section">
            <div className="section-top">
              <h2>گزارش جامع پرونده</h2>
            </div>
            {loadingReport || !report ? (
              <div className="section-empty">در حال دریافت جزئیات پرونده...</div>
            ) : (
              <CaseDossier
                report={report}
                actionPanel={
                  <div className="judge-action-panel">
                    <h3>ثبت رای دادگاه</h3>

                    <label htmlFor="judge-defendant">متهم</label>
                    <select
                      id="judge-defendant"
                      value={selectedDefendant}
                      onChange={(event) => setSelectedDefendant(event.target.value)}
                    >
                      <option value="">انتخاب متهم</option>
                      {suspectOptions.map((suspect) => (
                        <option key={suspect.id} value={String(suspect.id)}>
                          #{suspect.id} - {suspect.username} ({suspect.nationalId})
                        </option>
                      ))}
                    </select>
                    {suspectOptions.length === 0 ? (
                      <div className="judge-inline-note">همه متهمان این پرونده قبلا قضاوت شده‌اند.</div>
                    ) : null}

                    <label htmlFor="judge-verdict">حکم نهایی</label>
                    <select
                      id="judge-verdict"
                      value={verdict}
                      onChange={(event) => setVerdict(event.target.value as 'innocent' | 'guilty')}
                    >
                      <option value="innocent">بی‌گناه (innocent)</option>
                      <option value="guilty">گناهکار (guilty)</option>
                    </select>

                    <label htmlFor="judge-verdict-note">توضیح رای</label>
                    <textarea
                      id="judge-verdict-note"
                      rows={4}
                      value={verdictNote}
                      onChange={(event) => setVerdictNote(event.target.value)}
                      placeholder="توضیح مستدل رای دادگاه"
                    />

                    {verdict === 'guilty' ? (
                      <>
                        <label htmlFor="judge-punishment-title">عنوان مجازات</label>
                        <input
                          id="judge-punishment-title"
                          type="text"
                          value={punishmentTitle}
                          onChange={(event) => setPunishmentTitle(event.target.value)}
                          placeholder="مثال: حبس تعزیری"
                        />

                        <label htmlFor="judge-punishment-description">توضیح مجازات</label>
                        <textarea
                          id="judge-punishment-description"
                          rows={3}
                          value={punishmentDescription}
                          onChange={(event) => setPunishmentDescription(event.target.value)}
                          placeholder="شرح کامل مجازات"
                        />
                      </>
                    ) : null}

                    <div className="judge-action-buttons">
                      <button
                        type="button"
                        onClick={submitTrial}
                        disabled={submittingVerdict || suspectOptions.length === 0}
                      >
                        {submittingVerdict ? 'در حال ثبت...' : 'ثبت رای نهایی'}
                      </button>
                    </div>
                  </div>
                }
              />
            )}
          </section>
        )}
      </div>
    </ProtectedModule>
  );
};

export default JudgeDashboard;
