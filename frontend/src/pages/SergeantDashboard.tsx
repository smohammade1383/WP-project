import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ProtectedModule from '../components/ProtectedModule';
import {
  evidenceApi,
  sergeantApi,
  type EvidenceRecord,
  type SergeantCase,
  type SergeantSuspectProfile,
} from '../services';
import { boardApi, type BoardItem as BoardItemType, type BoardLink as BoardLinkType } from '../services/board.api';
import './SergeantDashboard.css';

type SergeantTab = 'crime-scenes' | 'operations' | 'detention';
type SergeantQueueTab = 'available' | 'mine';

const TAB_LABELS: Record<SergeantTab, string> = {
  'crime-scenes': 'تایید صحنه جرم',
  operations: 'درخواست‌های عملیاتی',
  detention: 'بازداشتگاه و وثیقه',
};

const MODULE_BY_TAB: Record<SergeantTab, string> = {
  'crime-scenes': 'sergeant-crime-scenes',
  operations: 'sergeant-operations',
  detention: 'sergeant-detention',
};

const QUEUE_TAB_LABELS: Record<SergeantQueueTab, string> = {
  available: 'پرونده‌های قابل پذیرش',
  mine: 'پرونده‌های فعال من',
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

const severityLabelMap: Record<number, string> = {
  1: 'سطح ۳',
  2: 'سطح ۲',
  3: 'سطح ۱',
  4: 'بحرانی',
};

const evidenceTypeLabelMap: Record<EvidenceRecord['type'], string> = {
  transcription: 'استشهاد شاهدان',
  bio_medical: 'زیستی/پزشکی',
  vehicle: 'وسیله نقلیه',
  identity_document: 'مدرک شناسایی',
  other: 'سایر',
};

const formatDetailValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '-';
  }
};

const resolveTab = (pathname: string): SergeantTab => {
  if (pathname === '/sergeant/operations') return 'operations';
  if (pathname === '/sergeant/detention') return 'detention';
  return 'crime-scenes';
};

const tabPathMap: Record<SergeantTab, string> = {
  'crime-scenes': '/sergeant/crime-scenes',
  operations: '/sergeant/operations',
  detention: '/sergeant/detention',
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

const hasDetectiveScore = (profile: SergeantSuspectProfile): boolean =>
  profile.scores.some((score) => score.scorer_role === 'detective');

const hasSergeantScore = (profile: SergeantSuspectProfile): boolean =>
  profile.scores.some((score) => score.scorer_role === 'sergeant');

const SergeantDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SergeantTab>(() => resolveTab(location.pathname));
  const [cases, setCases] = useState<SergeantCase[]>([]);
  const [unassignedCases, setUnassignedCases] = useState<SergeantCase[]>([]);
  const [profiles, setProfiles] = useState<SergeantSuspectProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [queueTab, setQueueTab] = useState<SergeantQueueTab>('mine');

  const [actionCaseId, setActionCaseId] = useState<number | null>(null);
  const [claimCaseId, setClaimCaseId] = useState<number | null>(null);
  const [actionProfileId, setActionProfileId] = useState<number | null>(null);
  const [decisionByCase, setDecisionByCase] = useState<Record<number, string>>({});
  const [scoreByProfile, setScoreByProfile] = useState<Record<number, string>>({});
  const [notesByProfile, setNotesByProfile] = useState<Record<number, string>>({});
  const [bailAmountByProfile, setBailAmountByProfile] = useState<Record<number, string>>({});
  const [bailTypeByProfile, setBailTypeByProfile] = useState<Record<number, 'bail' | 'fine'>>({});
  const [paymentLinkByProfile, setPaymentLinkByProfile] = useState<Record<number, string>>({});
  const [captainMessageByCase, setCaptainMessageByCase] = useState<Record<number, string>>({});
  const [detailCaseId, setDetailCaseId] = useState<number | null>(null);
  const [detailEvidence, setDetailEvidence] = useState<EvidenceRecord[]>([]);
  const [detailBoardItems, setDetailBoardItems] = useState<BoardItemType[]>([]);
  const [detailBoardLinks, setDetailBoardLinks] = useState<BoardLinkType[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    setActiveTab(resolveTab(location.pathname));
  }, [location.pathname]);

  const requiredModuleId = MODULE_BY_TAB[activeTab];

  const loadData = async () => {
    try {
      setLoading(true);
      const [caseList, unassignedList, profileList] = await Promise.all([
        sergeantApi.listCases(),
        sergeantApi.listUnassignedSergeantCases(),
        sergeantApi.listSuspectProfiles(),
      ]);
      setCases(caseList);
      setUnassignedCases(unassignedList);
      setProfiles(profileList);
      setError('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت داده‌های ماژول گروهبان'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const casesById = useMemo(() => {
    const mapping = new Map<number, SergeantCase>();
    cases.forEach((item) => mapping.set(item.id, item));
    return mapping;
  }, [cases]);

  const crimeSceneQueue = useMemo(
    () =>
      cases
        .filter((item) => item.source_type === 'CrimeScene' && item.status === 'PendingOfficer')
        .sort((a, b) => b.id - a.id),
    [cases]
  );

  const operationItems = useMemo(() => {
    const result = cases
      .filter((item) => item.status === 'WarrantPending')
      .map((caseItem) => {
        const pendingProfiles = profiles.filter(
          (profile) => profile.case === caseItem.id && !profile.arrest_warrant_issued
        );
        return { caseItem, pendingProfiles };
      })
      .filter((item) => item.pendingProfiles.length > 0)
      .sort((a, b) => b.caseItem.id - a.caseItem.id);
    return result;
  }, [cases, profiles]);

  const availableSergeantQueue = useMemo(
    () =>
      unassignedCases
        .filter((item) => item.status === 'WarrantPending')
        .sort((a, b) => b.id - a.id),
    [unassignedCases]
  );

  const arrestQueue = useMemo(
    () =>
      profiles
        .filter((profile) => profile.arrest_warrant_issued && !profile.is_arrested)
        .sort((a, b) => b.id - a.id),
    [profiles]
  );

  const detainedProfiles = useMemo(
    () =>
      profiles
        .filter((profile) => profile.arrest_warrant_issued && profile.is_arrested)
        .sort((a, b) => b.id - a.id),
    [profiles]
  );

  const captainCandidates = useMemo(() => {
    const grouped = new Map<number, SergeantSuspectProfile[]>();
    profiles
      .filter((profile) => {
        if (!profile.is_arrested) return false;
        const relatedCase = casesById.get(profile.case);
        return relatedCase?.status === 'Arrested';
      })
      .forEach((profile) => {
        const list = grouped.get(profile.case) || [];
        list.push(profile);
        grouped.set(profile.case, list);
      });

    return Array.from(grouped.entries())
      .map(([caseId, relatedProfiles]) => {
        const missing = relatedProfiles.filter(
          (profile) => !hasDetectiveScore(profile) || !hasSergeantScore(profile)
        );
        return {
          caseId,
          caseInfo: casesById.get(caseId) || null,
          profileCount: relatedProfiles.length,
          missingProfiles: missing,
          ready: missing.length === 0,
        };
      })
      .sort((a, b) => b.caseId - a.caseId);
  }, [casesById, profiles]);

  const selectedDetailCase = useMemo(
    () => (detailCaseId ? casesById.get(detailCaseId) || null : null),
    [casesById, detailCaseId]
  );

  const boardItemLabelMap = useMemo(() => {
    const labels: Record<number, string> = {};
    detailBoardItems.forEach((item) => {
      if (item.item_type === 'note') {
        labels[item.id] = item.note_text?.trim() ? `یادداشت: ${item.note_text}` : `یادداشت #${item.id}`;
      } else if (item.item_type === 'evidence') {
        labels[item.id] = item.evidence_title?.trim() ? item.evidence_title : `مدرک #${item.id}`;
      } else if (item.item_type === 'witness') {
        labels[item.id] = item.username?.trim() ? `شاهد: ${item.username}` : `شاهد #${item.id}`;
      } else if (item.item_type === 'suspect') {
        labels[item.id] = item.username?.trim() ? `مظنون: ${item.username}` : `مظنون #${item.id}`;
      }
    });
    return labels;
  }, [detailBoardItems]);

  const detectiveNotes = useMemo(
    () => detailBoardItems.filter((item) => item.item_type === 'note' && item.note_text?.trim()),
    [detailBoardItems]
  );

  const navigateTab = (tab: SergeantTab) => {
    setActiveTab(tab);
    navigate(tabPathMap[tab]);
  };

  const handleApproveCrimeScene = async (caseId: number) => {
    try {
      setActionCaseId(caseId);
      setError('');
      setSuccess('');
      await sergeantApi.approveCrimeScene(caseId);
      setSuccess(`پرونده #${caseId} تایید شد و به وضعیت باز منتقل گردید.`);
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'تایید پرونده صحنه جرم ناموفق بود.'));
    } finally {
      setActionCaseId(null);
    }
  };

  const handleClaimCase = async (caseId: number) => {
    try {
      setClaimCaseId(caseId);
      setError('');
      setSuccess('');
      await sergeantApi.claimSergeantCase(caseId);
      setQueueTab('mine');
      setSuccess(`پرونده #${caseId} با موفقیت به کارتابل شما اضافه شد.`);
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'پذیرش پرونده ناموفق بود.'));
    } finally {
      setClaimCaseId(null);
    }
  };

  const handleSergeantDecision = async (caseId: number, approved: boolean) => {
    const message = (decisionByCase[caseId] || '').trim();
    if (!approved && !message) {
      setError('برای رد درخواست عملیاتی، درج توضیح الزامی است.');
      return;
    }
    try {
      setActionCaseId(caseId);
      setError('');
      setSuccess('');
      await sergeantApi.submitSergeantDecision(caseId, { approved, message });
      setSuccess(
        approved
          ? `درخواست پرونده #${caseId} تایید شد و حکم جلب برای مظنونین صادر شد.`
          : `درخواست پرونده #${caseId} رد شد و پرونده به کارآگاه بازگشت.`
      );
      setDecisionByCase((prev) => ({ ...prev, [caseId]: '' }));
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت تصمیم گروهبان ناموفق بود.'));
    } finally {
      setActionCaseId(null);
    }
  };

  const handleMarkArrested = async (profileId: number) => {
    try {
      setActionProfileId(profileId);
      setError('');
      setSuccess('');
      await sergeantApi.markArrested(profileId);
      setSuccess(`مظنون پروفایل #${profileId} به عنوان بازداشت‌شده ثبت شد.`);
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت بازداشت ناموفق بود.'));
    } finally {
      setActionProfileId(null);
    }
  };

  const handleSubmitScore = async (profileId: number) => {
    const scoreValue = Number(scoreByProfile[profileId]);
    if (!Number.isInteger(scoreValue) || scoreValue < 1 || scoreValue > 10) {
      setError('امتیاز بازجویی باید عدد صحیح بین ۱ تا ۱۰ باشد.');
      return;
    }
    try {
      setActionProfileId(profileId);
      setError('');
      setSuccess('');
      await sergeantApi.submitInterrogationScore(profileId, {
        score: scoreValue,
        notes: (notesByProfile[profileId] || '').trim(),
      });
      setSuccess(`امتیاز بازجویی برای پروفایل #${profileId} ثبت شد.`);
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت امتیاز بازجویی ناموفق بود.'));
    } finally {
      setActionProfileId(null);
    }
  };

  const handleInitiateBail = async (profileId: number) => {
    const amount = Number(bailAmountByProfile[profileId]);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('مبلغ وثیقه/جریمه باید عدد صحیح مثبت باشد.');
      return;
    }

    try {
      setActionProfileId(profileId);
      setError('');
      setSuccess('');
      await sergeantApi.updateBailPolicy(profileId, {
        is_bail_allowed: true,
        bail_amount: amount,
      });
      const response = await sergeantApi.initiateBail({
        suspect_profile: profileId,
        amount,
        transaction_type: bailTypeByProfile[profileId] || 'bail',
        return_url: `${window.location.origin}/legal-bail`,
      });
      setPaymentLinkByProfile((prev) => ({
        ...prev,
        [profileId]: response.payment_url,
      }));
      setSuccess(`تراکنش #${response.transaction.id} ایجاد شد. لینک پرداخت آماده است.`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ایجاد تراکنش وثیقه/جریمه ناموفق بود.'));
    } finally {
      setActionProfileId(null);
    }
  };

  const handleSubmitToCaptain = async (caseId: number) => {
    try {
      setActionCaseId(caseId);
      setError('');
      setSuccess('');
      const response = await sergeantApi.submitToCaptain(caseId, {
        message: (captainMessageByCase[caseId] || '').trim(),
      });
      setSuccess(
        `پرونده #${response.case.id} با ${response.submitted_profiles} مظنون بازداشت‌شده به صف کاپیتان ارسال شد.`
      );
      setCaptainMessageByCase((prev) => ({ ...prev, [caseId]: '' }));
      await loadData();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ارسال پرونده به کاپیتان ناموفق بود.'));
    } finally {
      setActionCaseId(null);
    }
  };

  const openOperationDetails = async (caseId: number) => {
    try {
      setDetailCaseId(caseId);
      setDetailLoading(true);
      setDetailError('');
      const [evidence, board] = await Promise.all([
        evidenceApi.listByCase(caseId),
        boardApi.getDetectiveBoard(caseId),
      ]);
      setDetailEvidence(evidence);
      setDetailBoardItems(board.items || []);
      setDetailBoardLinks(board.links || []);
    } catch (err: unknown) {
      setDetailError(getErrorMessage(err, 'دریافت جزئیات مدارک و یادداشت‌های کارآگاه ناموفق بود.'));
      setDetailEvidence([]);
      setDetailBoardItems([]);
      setDetailBoardLinks([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeOperationDetails = () => {
    setDetailCaseId(null);
    setDetailError('');
    setDetailLoading(false);
    setDetailEvidence([]);
    setDetailBoardItems([]);
    setDetailBoardLinks([]);
  };

  return (
    <ProtectedModule moduleId={requiredModuleId}>
      <div className="sergeant-page">
        <header className="sergeant-header">
          <div>
            <h1>ماژول گروهبان</h1>
            <p>تایید صحنه جرم، مدیریت حکم جلب، بازجویی، وثیقه، و ارسال پرونده به کاپیتان</p>
          </div>
          <button type="button" onClick={loadData} disabled={loading}>
            {loading ? '...' : 'بارگذاری مجدد'}
          </button>
        </header>

        <nav className="sergeant-tabs">
          {(Object.keys(TAB_LABELS) as SergeantTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={tab === activeTab ? 'active' : ''}
              onClick={() => navigateTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>

        {activeTab !== 'crime-scenes' && (
          <nav className="assignment-tabs">
            {(Object.keys(QUEUE_TAB_LABELS) as SergeantQueueTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={tab === queueTab ? 'active' : ''}
                onClick={() => setQueueTab(tab)}
              >
                {QUEUE_TAB_LABELS[tab]}
              </button>
            ))}
          </nav>
        )}

        {(error || success) && (
          <div className={`sergeant-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        {activeTab === 'crime-scenes' && (
          <section className="sergeant-section">
            <div className="section-top">
              <h2>Crime Scene Review</h2>
              <span>در انتظار تایید: {crimeSceneQueue.length}</span>
            </div>
            {loading ? (
              <div className="section-empty">در حال دریافت پرونده‌ها...</div>
            ) : crimeSceneQueue.length === 0 ? (
              <div className="section-empty">پرونده صحنه جرم در انتظار تایید وجود ندارد.</div>
            ) : (
              <div className="sergeant-grid">
                {crimeSceneQueue.map((item) => (
                  <article key={item.id} className="sergeant-card">
                    <div className="card-title-row">
                      <h3>
                        #{item.id} - {item.title}
                      </h3>
                      <span className="status-pill">{statusLabelMap[item.status] || item.status}</span>
                    </div>
                    <p>{item.description}</p>
                    <div className="card-meta">
                      <span>سطح جرم: {severityLabelMap[item.severity] || item.severity}</span>
                      <span>زمان وقوع: {formatDate(item.incident_datetime)}</span>
                    </div>
                    <div className="card-meta">
                      <span>
                        ثبت‌کننده: {item.created_by.first_name} {item.created_by.last_name}
                      </span>
                      <span>مکان: {item.location}</span>
                    </div>
                    <div className="card-actions">
                      <button
                        type="button"
                        className="primary"
                        disabled={actionCaseId === item.id}
                        onClick={() => handleApproveCrimeScene(item.id)}
                      >
                        {actionCaseId === item.id ? 'در حال تایید...' : 'تایید پرونده'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'operations' && (
          <section className="sergeant-section">
            <div className="section-top">
              <h2>Warrant Review (Arrest Requests)</h2>
              <span>
                قابل پذیرش: {availableSergeantQueue.length} | فعال من: {operationItems.length}
              </span>
            </div>
            {loading ? (
              <div className="section-empty">در حال دریافت درخواست‌های عملیاتی...</div>
            ) : queueTab === 'available' ? (
              availableSergeantQueue.length === 0 ? (
                <div className="section-empty">پرونده‌ای در صف پذیرش گروهبان وجود ندارد.</div>
              ) : (
                <div className="sergeant-grid">
                  {availableSergeantQueue.map((caseItem) => (
                    <article key={caseItem.id} className="sergeant-card claim-card">
                      <div className="card-title-row">
                        <h3>
                          پرونده #{caseItem.id} - {caseItem.title}
                        </h3>
                        <span className="status-pill">{statusLabelMap[caseItem.status] || caseItem.status}</span>
                      </div>
                      <p>{caseItem.description}</p>
                      <div className="card-meta">
                        <span>سطح جرم: {severityLabelMap[caseItem.severity] || caseItem.severity}</span>
                        <span>ثبت: {formatDate(caseItem.created_at)}</span>
                      </div>
                      <div className="card-meta">
                        <span>
                          ایجادکننده: {caseItem.created_by.first_name} {caseItem.created_by.last_name}
                        </span>
                        <span>مکان: {caseItem.location}</span>
                      </div>
                      <div className="card-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={claimCaseId === caseItem.id}
                          onClick={() => handleClaimCase(caseItem.id)}
                        >
                          {claimCaseId === caseItem.id ? 'در حال پذیرش...' : 'پذیرش پرونده'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )
            ) : operationItems.length === 0 ? (
              <div className="section-empty">
                پرونده فعالی در اختیار شما نیست. از تب «پرونده‌های قابل پذیرش» یک پرونده را پذیرش کنید.
              </div>
            ) : (
              <div className="sergeant-grid">
                {operationItems.map(({ caseItem, pendingProfiles }) => (
                  <article key={caseItem.id} className="sergeant-card">
                    <div className="card-title-row">
                      <h3>
                        پرونده #{caseItem.id} - {caseItem.title}
                      </h3>
                      <span className="status-pill">{statusLabelMap[caseItem.status] || caseItem.status}</span>
                    </div>
                    <div className="card-meta">
                      <span>مظنونین پیشنهادی: {pendingProfiles.length}</span>
                      <span>سطح جرم: {severityLabelMap[caseItem.severity] || caseItem.severity}</span>
                    </div>
                    <ul className="suspect-list">
                      {pendingProfiles.map((profile) => (
                        <li key={profile.id}>
                          <strong>
                            {profile.suspect.first_name} {profile.suspect.last_name}
                          </strong>
                          <span>پروفایل #{profile.id}</span>
                        </li>
                      ))}
                    </ul>
                    <label className="field-label">
                      توضیح تصمیم (برای رد الزامی)
                      <textarea
                        rows={3}
                        value={decisionByCase[caseItem.id] || ''}
                        onChange={(event) =>
                          setDecisionByCase((prev) => ({ ...prev, [caseItem.id]: event.target.value }))
                        }
                        placeholder="علت تایید یا رد درخواست را بنویسید"
                      />
                    </label>
                    <div className="card-actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={detailLoading && detailCaseId === caseItem.id}
                        onClick={() => openOperationDetails(caseItem.id)}
                      >
                        {detailLoading && detailCaseId === caseItem.id
                          ? 'در حال دریافت...'
                          : 'مشاهده مدارک و یادداشت‌ها'}
                      </button>
                      <button
                        type="button"
                        className="primary"
                        disabled={actionCaseId === caseItem.id}
                        onClick={() => handleSergeantDecision(caseItem.id, true)}
                      >
                        {actionCaseId === caseItem.id ? 'در حال ثبت...' : 'تایید و صدور حکم جلب'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={actionCaseId === caseItem.id}
                        onClick={() => handleSergeantDecision(caseItem.id, false)}
                      >
                        رد درخواست
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'detention' && (
          <section className="sergeant-section">
            <div className="section-top">
              <h2>Interrogation, Bail, and Captain Handover</h2>
              <span>منتظر بازداشت: {arrestQueue.length} | بازداشت‌شده: {detainedProfiles.length}</span>
            </div>

            {queueTab === 'available' ? (
              <div className="section-empty">
                عملیات بازداشت، بازجویی، وثیقه، و ارسال به کاپیتان فقط برای «پرونده‌های فعال من» در دسترس است.
              </div>
            ) : (
              <>
                <section className="sub-section">
                  <h3>مرحله ۱: اجرای حکم جلب</h3>
                  {arrestQueue.length === 0 ? (
                    <div className="section-empty">مظنونی برای شروع بازداشت وجود ندارد.</div>
                  ) : (
                    <div className="sergeant-grid">
                      {arrestQueue.map((profile) => {
                        const relatedCase = casesById.get(profile.case);
                        return (
                          <article key={profile.id} className="sergeant-card">
                            <div className="card-title-row">
                              <h4>
                                پروفایل #{profile.id} - {profile.suspect.first_name} {profile.suspect.last_name}
                              </h4>
                              <span className="status-pill">حکم جلب صادر شده</span>
                            </div>
                            <div className="card-meta">
                              <span>پرونده: #{profile.case}</span>
                              <span>
                                سطح جرم: {relatedCase ? severityLabelMap[relatedCase.severity] || relatedCase.severity : '-'}
                              </span>
                            </div>
                            <div className="card-actions">
                              <button
                                type="button"
                                className="primary"
                                disabled={actionProfileId === profile.id}
                                onClick={() => handleMarkArrested(profile.id)}
                              >
                                {actionProfileId === profile.id ? 'در حال ثبت...' : 'شروع بازداشت'}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="sub-section">
                  <h3>مرحله ۲: بازجویی و مدیریت وثیقه</h3>
                  {detainedProfiles.length === 0 ? (
                    <div className="section-empty">مظنون بازداشت‌شده‌ای برای بازجویی وجود ندارد.</div>
                  ) : (
                    <div className="sergeant-grid">
                      {detainedProfiles.map((profile) => {
                        const relatedCase = casesById.get(profile.case);
                        const detectiveDone = hasDetectiveScore(profile);
                        const sergeantDone = hasSergeantScore(profile);
                        const caseSeverity = relatedCase?.severity || 0;
                        const likelyBailSeverity = caseSeverity === 1 || caseSeverity === 2;
                        return (
                          <article key={profile.id} className="sergeant-card">
                            <div className="card-title-row">
                              <h4>
                                پروفایل #{profile.id} - {profile.suspect.first_name} {profile.suspect.last_name}
                              </h4>
                              <span className="status-pill">بازداشت‌شده</span>
                            </div>

                            <div className="card-meta">
                              <span>پرونده: #{profile.case}</span>
                              <span>
                                سطح جرم: {relatedCase ? severityLabelMap[relatedCase.severity] || relatedCase.severity : '-'}
                              </span>
                            </div>

                            <div className="score-status">
                              <span className={detectiveDone ? 'ok' : 'warn'}>
                                نمره کارآگاه: {detectiveDone ? 'ثبت شده' : 'ثبت نشده'}
                              </span>
                              <span className={sergeantDone ? 'ok' : 'warn'}>
                                نمره گروهبان: {sergeantDone ? 'ثبت شده' : 'ثبت نشده'}
                              </span>
                            </div>

                            <div className="score-form">
                              <label>
                                امتیاز گناهکاری (۱ تا ۱۰)
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={scoreByProfile[profile.id] || ''}
                                  onChange={(event) =>
                                    setScoreByProfile((prev) => ({ ...prev, [profile.id]: event.target.value }))
                                  }
                                  placeholder="مثال: 7"
                                />
                              </label>
                              <label>
                                توضیح بازجویی
                                <textarea
                                  rows={3}
                                  value={notesByProfile[profile.id] || ''}
                                  onChange={(event) =>
                                    setNotesByProfile((prev) => ({ ...prev, [profile.id]: event.target.value }))
                                  }
                                  placeholder="شرح استدلال بازجویی"
                                />
                              </label>
                              <button
                                type="button"
                                className="primary"
                                disabled={actionProfileId === profile.id}
                                onClick={() => handleSubmitScore(profile.id)}
                              >
                                {actionProfileId === profile.id ? 'در حال ثبت...' : 'ثبت نمره گروهبان'}
                              </button>
                            </div>

                            <div className="bail-form">
                              <h5>Bail Management</h5>
                              {!likelyBailSeverity && (
                                <p className="hint">
                                  این سطح جرم عموما مشمول وثیقه نیست و ممکن است API تراکنش را رد کند.
                                </p>
                              )}
                              <label>
                                مبلغ (ریال)
                                <input
                                  type="number"
                                  min={1}
                                  value={bailAmountByProfile[profile.id] || ''}
                                  onChange={(event) =>
                                    setBailAmountByProfile((prev) => ({ ...prev, [profile.id]: event.target.value }))
                                  }
                                  placeholder="مثال: 50000000"
                                />
                              </label>
                              <label>
                                نوع پرداخت
                                <select
                                  value={bailTypeByProfile[profile.id] || 'bail'}
                                  onChange={(event) =>
                                    setBailTypeByProfile((prev) => ({
                                      ...prev,
                                      [profile.id]: event.target.value as 'bail' | 'fine',
                                    }))
                                  }
                                >
                                  <option value="bail">وثیقه</option>
                                  <option value="fine">جریمه</option>
                                </select>
                              </label>
                              <button
                                type="button"
                                className="secondary"
                                disabled={actionProfileId === profile.id}
                                onClick={() => handleInitiateBail(profile.id)}
                              >
                                {actionProfileId === profile.id ? 'در حال ایجاد...' : 'ایجاد تراکنش پرداخت'}
                              </button>
                              {paymentLinkByProfile[profile.id] && (
                                <a
                                  href={paymentLinkByProfile[profile.id]}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="payment-link"
                                >
                                  لینک پرداخت آنلاین
                                </a>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="sub-section">
                  <h3>مرحله ۳: Submit to Captain</h3>
                  {captainCandidates.length === 0 ? (
                    <div className="section-empty">پرونده بازداشت‌شده‌ای برای ارسال به کاپیتان وجود ندارد.</div>
                  ) : (
                    <div className="sergeant-grid">
                      {captainCandidates.map((item) => (
                        <article key={item.caseId} className="sergeant-card">
                          <div className="card-title-row">
                            <h4>
                              پرونده #{item.caseId}
                              {item.caseInfo ? ` - ${item.caseInfo.title}` : ''}
                            </h4>
                            <span className={`status-pill ${item.ready ? 'pill-ok' : 'pill-warn'}`}>
                              {item.ready ? 'آماده ارسال' : 'ناقص'}
                            </span>
                          </div>
                          <div className="card-meta">
                            <span>تعداد مظنون بازداشت‌شده: {item.profileCount}</span>
                            <span>وضعیت فعلی: {item.caseInfo ? statusLabelMap[item.caseInfo.status] || item.caseInfo.status : '-'}</span>
                          </div>

                          {!item.ready && (
                            <div className="missing-box">
                              <strong>پروفایل‌های ناقص:</strong>
                              <ul>
                                {item.missingProfiles.map((profile) => (
                                  <li key={profile.id}>
                                    #{profile.id} - {profile.suspect.first_name} {profile.suspect.last_name}
                                    {!hasDetectiveScore(profile) ? ' | نمره کارآگاه ندارد' : ''}
                                    {!hasSergeantScore(profile) ? ' | نمره گروهبان ندارد' : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <label className="field-label">
                            پیام برای کاپیتان (اختیاری)
                            <textarea
                              rows={3}
                              value={captainMessageByCase[item.caseId] || ''}
                              onChange={(event) =>
                                setCaptainMessageByCase((prev) => ({
                                  ...prev,
                                  [item.caseId]: event.target.value,
                                }))
                              }
                              placeholder="خلاصه‌ای از وضعیت بازجویی و مدارک"
                            />
                          </label>

                          <div className="card-actions">
                            <button
                              type="button"
                              className="primary"
                              disabled={!item.ready || actionCaseId === item.caseId}
                              onClick={() => handleSubmitToCaptain(item.caseId)}
                            >
                              {actionCaseId === item.caseId ? 'در حال ارسال...' : 'ارسال به صف کاپیتان'}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        )}

        {detailCaseId && (
          <div className="operation-detail-overlay" role="dialog" aria-modal="true">
            <div className="operation-detail-modal">
              <div className="operation-detail-header">
                <div>
                  <h3>
                    جزئیات پرونده #{detailCaseId}
                    {selectedDetailCase ? ` - ${selectedDetailCase.title}` : ''}
                  </h3>
                  <p>بررسی مدارک ثبت‌شده و یادداشت‌های تحلیلی کارآگاه</p>
                </div>
                <button type="button" className="secondary" onClick={closeOperationDetails}>
                  بستن
                </button>
              </div>

              {detailLoading ? (
                <div className="section-empty">در حال دریافت جزئیات پرونده...</div>
              ) : detailError ? (
                <div className="sergeant-feedback error">{detailError}</div>
              ) : (
                <>
                  <section className="operation-detail-section">
                    <div className="section-top">
                      <h4>مدارک پرونده</h4>
                      <span>{detailEvidence.length} مورد</span>
                    </div>
                    {detailEvidence.length === 0 ? (
                      <div className="section-empty">مدرکی برای این پرونده ثبت نشده است.</div>
                    ) : (
                      <div className="operation-evidence-grid">
                        {detailEvidence.map((item) => (
                          <article key={item.id} className="operation-evidence-card">
                            <div className="card-title-row">
                              <h5>{item.title}</h5>
                              <span className="status-pill">{evidenceTypeLabelMap[item.type] || item.type}</span>
                            </div>
                            <p>{item.description}</p>
                            <div className="card-meta">
                              <span>
                                ثبت‌کننده: {item.created_by.first_name} {item.created_by.last_name}
                              </span>
                              <span>{formatDate(item.created_at)}</span>
                            </div>
                            {Object.keys(item.details || {}).length > 0 && (
                              <div className="detail-kv">
                                {Object.entries(item.details).map(([key, value]) => (
                                  <div key={`${item.id}-${key}`} className="detail-kv-row">
                                    <span>{key}</span>
                                    <strong>{formatDetailValue(value)}</strong>
                                  </div>
                                ))}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="operation-detail-section">
                    <div className="section-top">
                      <h4>یادداشت‌های کارآگاه (از تخته کارآگاه)</h4>
                      <span>{detectiveNotes.length} یادداشت</span>
                    </div>
                    {detectiveNotes.length === 0 ? (
                      <div className="section-empty">یادداشتی روی تخته کارآگاه ثبت نشده است.</div>
                    ) : (
                      <ul className="operation-note-list">
                        {detectiveNotes.map((item) => (
                          <li key={item.id}>
                            <strong>یادداشت #{item.id}:</strong> {item.note_text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="operation-detail-section">
                    <div className="section-top">
                      <h4>ارتباطات تخته کارآگاه</h4>
                      <span>{detailBoardLinks.length} اتصال</span>
                    </div>
                    {detailBoardLinks.length === 0 ? (
                      <div className="section-empty">اتصالی بین آیتم‌های تخته ثبت نشده است.</div>
                    ) : (
                      <div className="operation-link-list">
                        {detailBoardLinks.map((link) => (
                          <div key={link.id} className="operation-link-row">
                            <span>
                              {boardItemLabelMap[link.from_item] || `آیتم #${link.from_item}`} ←{' '}
                              {boardItemLabelMap[link.to_item] || `آیتم #${link.to_item}`}
                            </span>
                            {link.description ? <strong>{link.description}</strong> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedModule>
  );
};

export default SergeantDashboard;
