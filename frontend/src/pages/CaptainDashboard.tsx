import { useEffect, useMemo, useState } from 'react';
import ProtectedModule from '../components/ProtectedModule';
import {
  captainApi,
  type CaptainCase,
  type CaptainScore,
  type CaptainSuspectProfile,
  type EvidenceRecord,
} from '../services';
import './CaptainDashboard.css';

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
  return new Date(value).toLocaleString('fa-IR', {
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

const byLatest = (a: CaptainScore, b: CaptainScore) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

const latestScoreByRole = (
  profile: CaptainSuspectProfile,
  role: 'detective' | 'sergeant'
): CaptainScore | null => {
  const found = profile.scores.filter((item) => item.scorer_role === role).sort(byLatest);
  return found[0] || null;
};

const CaptainDashboard = () => {
  const [cases, setCases] = useState<CaptainCase[]>([]);
  const [profiles, setProfiles] = useState<CaptainSuspectProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionCaseId, setActionCaseId] = useState<number | null>(null);
  const [noteByCase, setNoteByCase] = useState<Record<number, string>>({});

  const [evidenceCase, setEvidenceCase] = useState<CaptainCase | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceRecord[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allCases, allProfiles] = await Promise.all([
        captainApi.listCases(),
        captainApi.listSuspectProfiles(),
      ]);
      setCases(allCases);
      setProfiles(allProfiles);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت صف بررسی کاپیتان'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const queueCases = useMemo(() => {
    return cases
      .filter((item) => item.status === 'WaitingCaptain')
      .sort((a, b) => b.id - a.id);
  }, [cases]);

  const caseProfilesMap = useMemo(() => {
    const mapping = new Map<number, CaptainSuspectProfile[]>();
    profiles.forEach((profile) => {
      const arr = mapping.get(profile.case) || [];
      arr.push(profile);
      mapping.set(profile.case, arr);
    });
    return mapping;
  }, [profiles]);

  const openEvidenceModal = async (caseItem: CaptainCase) => {
    try {
      setEvidenceCase(caseItem);
      setEvidenceLoading(true);
      setEvidenceItems([]);
      const data = await captainApi.getCaseEvidence(caseItem.id);
      setEvidenceItems(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'دریافت شواهد پرونده ناموفق بود.'));
      setEvidenceCase(null);
    } finally {
      setEvidenceLoading(false);
    }
  };

  const closeEvidenceModal = () => {
    setEvidenceCase(null);
    setEvidenceItems([]);
    setEvidenceLoading(false);
  };

  const submitDecisionForCase = async (caseItem: CaptainCase, isConfirmed: boolean) => {
    const relatedProfiles = (caseProfilesMap.get(caseItem.id) || []).filter((item) => item.is_arrested);
    if (relatedProfiles.length === 0) {
      setError('برای این پرونده مظنون بازداشت‌شده‌ای برای تصمیم‌گیری یافت نشد.');
      return;
    }

    const summary = (noteByCase[caseItem.id] || '').trim();
    const fallbackSummary = isConfirmed
      ? caseItem.severity === 4
        ? 'Escalated to chief by captain.'
        : 'Prosecuted and sent to court by captain.'
      : 'Rejected by captain and returned to sergeant queue.';

    try {
      setActionCaseId(caseItem.id);
      setError('');
      setSuccess('');

      for (const profile of relatedProfiles) {
        await captainApi.submitProfileDecision(profile.id, {
          is_confirmed: isConfirmed,
          summary: summary || fallbackSummary,
        });
      }

      if (isConfirmed && caseItem.severity !== 4) {
        setSuccess(`پرونده #${caseItem.id} تایید شد و به صف قاضی ارسال گردید.`);
      } else if (isConfirmed && caseItem.severity === 4) {
        setSuccess(`پرونده بحرانی #${caseItem.id} به رئیس پلیس ارجاع شد.`);
      } else {
        setSuccess(`پرونده #${caseItem.id} به صف گروهبان بازگردانده شد.`);
      }

      setNoteByCase((prev) => ({ ...prev, [caseItem.id]: '' }));
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت تصمیم کاپیتان ناموفق بود.'));
    } finally {
      setActionCaseId(null);
    }
  };

  return (
    <ProtectedModule moduleId="captain-interrogations">
      <div className="captain-page">
        <header className="captain-header">
          <div>
            <h1>نظارت بر بازجویی (Captain)</h1>
            <p>بررسی پرونده‌های ارسال‌شده از گروهبان و تصمیم نهایی قبل از محاکمه</p>
          </div>
          <button type="button" onClick={loadData} disabled={loading}>
            {loading ? '...' : 'بارگذاری مجدد'}
          </button>
        </header>

        {(error || success) && (
          <div className={`captain-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        <section className="captain-section">
          <div className="section-top">
            <h2>Review Queue</h2>
            <span>پرونده‌های در انتظار کاپیتان: {queueCases.length}</span>
          </div>

          {loading ? (
            <div className="section-empty">در حال دریافت صف کاپیتان...</div>
          ) : queueCases.length === 0 ? (
            <div className="section-empty">پرونده‌ای در وضعیت WaitingCaptain وجود ندارد.</div>
          ) : (
            <div className="captain-grid">
              {queueCases.map((caseItem) => {
                const relatedProfiles = (caseProfilesMap.get(caseItem.id) || []).filter(
                  (profile) => profile.is_arrested
                );
                return (
                  <article key={caseItem.id} className="captain-card">
                    <div className="card-title-row">
                      <h3>
                        پرونده #{caseItem.id} - {caseItem.title}
                      </h3>
                      <span className="status-pill">{statusLabelMap[caseItem.status] || caseItem.status}</span>
                    </div>
                    <p>{caseItem.description}</p>
                    <div className="card-meta">
                      <span>سطح جرم: {severityLabelMap[caseItem.severity] || caseItem.severity}</span>
                      <span>زمان وقوع: {formatDate(caseItem.incident_datetime)}</span>
                    </div>
                    <div className="card-meta">
                      <span>
                        ثبت‌کننده: {caseItem.created_by.first_name} {caseItem.created_by.last_name}
                      </span>
                      <span>مکان: {caseItem.location}</span>
                    </div>

                    <section className="decision-support">
                      <h4>Decision Support UI</h4>
                      {relatedProfiles.length === 0 ? (
                        <p className="muted">مظنون بازداشت‌شده‌ای برای این پرونده ثبت نشده است.</p>
                      ) : (
                        <div className="score-grid">
                          {relatedProfiles.map((profile) => {
                            const detectiveScore = latestScoreByRole(profile, 'detective');
                            const sergeantScore = latestScoreByRole(profile, 'sergeant');
                            return (
                              <div key={profile.id} className="score-card">
                                <strong>
                                  {profile.suspect.first_name} {profile.suspect.last_name}
                                </strong>
                                <span>پروفایل #{profile.id}</span>
                                <div className="score-row">
                                  <label>نمره کارآگاه:</label>
                                  <span>{detectiveScore ? detectiveScore.score : 'ثبت نشده'}</span>
                                </div>
                                <div className="score-row">
                                  <label>نمره گروهبان:</label>
                                  <span>{sergeantScore ? sergeantScore.score : 'ثبت نشده'}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <div className="read-only-link">
                      <button type="button" className="secondary" onClick={() => openEvidenceModal(caseItem)}>
                        مشاهده Read-only شواهد پرونده
                      </button>
                    </div>

                    <label className="field-label">
                      توضیح تصمیم کاپیتان
                      <textarea
                        rows={3}
                        value={noteByCase[caseItem.id] || ''}
                        onChange={(event) =>
                          setNoteByCase((prev) => ({ ...prev, [caseItem.id]: event.target.value }))
                        }
                        placeholder="خلاصه تصمیم برای این پرونده"
                      />
                    </label>

                    <div className="card-actions">
                      {caseItem.severity === 4 ? (
                        <button
                          type="button"
                          className="primary"
                          disabled={actionCaseId === caseItem.id}
                          onClick={() => submitDecisionForCase(caseItem, true)}
                        >
                          {actionCaseId === caseItem.id ? 'در حال ثبت...' : 'Escalate to Chief'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="primary"
                          disabled={actionCaseId === caseItem.id}
                          onClick={() => submitDecisionForCase(caseItem, true)}
                        >
                          {actionCaseId === caseItem.id ? 'در حال ثبت...' : 'Prosecute / Send to Court'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="danger"
                        disabled={actionCaseId === caseItem.id}
                        onClick={() => submitDecisionForCase(caseItem, false)}
                      >
                        Reject (بازگشت به گروهبان)
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {evidenceCase && (
          <div className="captain-modal-overlay" onClick={closeEvidenceModal}>
            <div className="captain-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  شواهد پرونده #{evidenceCase.id} - {evidenceCase.title}
                </h3>
                <button type="button" onClick={closeEvidenceModal}>
                  ×
                </button>
              </div>
              {evidenceLoading ? (
                <div className="section-empty">در حال دریافت شواهد...</div>
              ) : evidenceItems.length === 0 ? (
                <div className="section-empty">مدرکی برای این پرونده ثبت نشده است.</div>
              ) : (
                <div className="evidence-list">
                  {evidenceItems.map((item) => (
                    <article key={item.id} className="evidence-item">
                      <h4>
                        #{item.id} - {item.title}
                      </h4>
                      <p>{item.description}</p>
                      <div className="card-meta">
                        <span>نوع: {item.type}</span>
                        <span>ثبت‌کننده: {item.created_by.username}</span>
                        <span>زمان: {formatDate(item.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedModule>
  );
};

export default CaptainDashboard;
