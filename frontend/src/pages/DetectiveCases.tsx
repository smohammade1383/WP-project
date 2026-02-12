import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import BoardItem from '../components/BoardItem';
import BoardLinks from '../components/BoardLinks';
import ProtectedModule from '../components/ProtectedModule';
import { boardApi, type BoardItem as BoardItemType, type BoardLink as BoardLinkType } from '../services/board.api';
import {
  detectiveApi,
  evidenceApi,
  type DetectiveCase,
  type DetectiveCaseUser,
  type EvidenceRecord,
  type EvidenceType,
} from '../services';
import './DetectiveCases.css';

type DetectiveTab = 'inbox' | 'evidence' | 'board' | 'handover';

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

type IdentityField = {
  key: string;
  value: string;
};

const TAB_LABELS: Record<DetectiveTab, string> = {
  inbox: 'کارتابل پرونده‌ها',
  evidence: 'ثبت و مدیریت شواهد',
  board: 'تخته کارآگاه',
  handover: 'حل پرونده و معرفی مظنون',
};

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
  PendingOfficer: 'در انتظار افسر',
  Open: 'باز / در حال بررسی',
  WarrantPending: 'در انتظار تایید گروهبان',
  Arrested: 'بازداشت انجام شده',
  InCourt: 'ارسال به دادگاه',
  Closed: 'بسته',
  Void: 'باطل',
};

const evidenceTypeLabelMap: Record<EvidenceType, string> = {
  transcription: 'استشهاد و محتوای شاهد',
  bio_medical: 'زیستی / پزشکی',
  vehicle: 'وسیله نقلیه',
  identity_document: 'مدارک شناسایی',
  other: 'سایر موارد',
};

const resolveInitialTab = (pathname: string, queryTab: string | null): DetectiveTab => {
  if (queryTab === 'inbox' || queryTab === 'evidence' || queryTab === 'board' || queryTab === 'handover') {
    return queryTab;
  }
  if (pathname === '/detective/evidence') return 'evidence';
  if (pathname === '/detective-board') return 'board';
  return 'inbox';
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    if ('data' in error) {
      const data = (error as { data?: unknown }).data;
      if (typeof data === 'string' && data.trim()) return data;
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail.trim()) return detail;
      }
    }
  }
  return fallback;
};

const formatDateTime = (value: string): string => {
  return new Date(value).toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const parseIds = (raw: string): number[] => {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const defaultEvidenceFormState = (): EvidenceFormState => ({
  title: '',
  description: '',
  transcript_text: '',
  result_followup: '',
  vehicle_model: '',
  vehicle_color: '',
  license_plate: '',
  serial_number: '',
  owner_full_name: '',
});

const DetectiveCases = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<DetectiveTab>(() =>
    resolveInitialTab(location.pathname, searchParams.get('tab'))
  );
  const [cases, setCases] = useState<DetectiveCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [notificationsByCase, setNotificationsByCase] = useState<Record<number, number>>({});
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const [evidenceItems, setEvidenceItems] = useState<EvidenceRecord[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('other');
  const [evidenceForm, setEvidenceForm] = useState<EvidenceFormState>(defaultEvidenceFormState());
  const [identityFields, setIdentityFields] = useState<IdentityField[]>([{ key: '', value: '' }]);
  const [transcriptionFiles, setTranscriptionFiles] = useState<File[]>([]);
  const [bioImages, setBioImages] = useState<File[]>([]);
  const [submittingEvidence, setSubmittingEvidence] = useState(false);

  const [boardItems, setBoardItems] = useState<BoardItemType[]>([]);
  const [boardLinks, setBoardLinks] = useState<BoardLinkType[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [selectedBoardItemId, setSelectedBoardItemId] = useState<number | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<number | null>(null);
  const [boardScale, setBoardScale] = useState(1);
  const [newBoardNote, setNewBoardNote] = useState('');
  const [savingBoard, setSavingBoard] = useState(false);
  const boardCanvasRef = useRef<HTMLDivElement>(null);
  const [lastBoardSnapshotAt, setLastBoardSnapshotAt] = useState<string>('');

  const [selectedNomineeIds, setSelectedNomineeIds] = useState<number[]>([]);
  const [manualNomineeIds, setManualNomineeIds] = useState('');
  const [nominationSummary, setNominationSummary] = useState('');
  const [attachBoardSnapshot, setAttachBoardSnapshot] = useState(true);
  const [submittingNomination, setSubmittingNomination] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const requiredModuleId = useMemo(() => {
    if (location.pathname === '/detective-board') return 'detective-board';
    if (location.pathname === '/detective/evidence') return 'detective-evidence';
    return 'detective-cases';
  }, [location.pathname]);

  useEffect(() => {
    setActiveTab(resolveInitialTab(location.pathname, searchParams.get('tab')));
  }, [location.pathname, searchParams]);

  const selectedCase = useMemo(
    () => cases.find((item) => item.id === selectedCaseId) || null,
    [cases, selectedCaseId]
  );

  const lockedStatuses = useMemo(
    () => new Set(['WarrantPending', 'Arrested', 'InCourt', 'Closed', 'Void']),
    []
  );
  const isCaseLocked = Boolean(selectedCase && lockedStatuses.has(selectedCase.status));

  const notificationTotal = useMemo(
    () => Object.values(notificationsByCase).reduce((acc, value) => acc + value, 0),
    [notificationsByCase]
  );

  const caseCandidates = useMemo(() => {
    const list = new Map<number, DetectiveCaseUser>();
    if (!selectedCase) return [] as DetectiveCaseUser[];
    const pushUser = (user: DetectiveCaseUser) => {
      if (!list.has(user.id)) list.set(user.id, user);
    };
    pushUser(selectedCase.created_by);
    selectedCase.complainants.forEach(pushUser);
    selectedCase.witnesses.forEach(pushUser);
    selectedCase.suspects.forEach(pushUser);
    return Array.from(list.values());
  }, [selectedCase]);

  const evidenceIdsOnBoard = useMemo(() => {
    const set = new Set<number>();
    boardItems.forEach((item) => {
      if (item.item_type === 'evidence' && typeof item.evidence === 'number') {
        set.add(item.evidence);
      }
    });
    return set;
  }, [boardItems]);

  const evidenceBagItems = useMemo(
    () => evidenceItems.filter((item) => !evidenceIdsOnBoard.has(item.id)),
    [evidenceItems, evidenceIdsOnBoard]
  );

  const loadCases = useCallback(async () => {
    try {
      setLoadingCases(true);
      const data = await detectiveApi.listCases();
      setCases(data);
      setError('');
      const requestedCaseId = Number(searchParams.get('caseId'));
      const hasRequestedCase = Number.isInteger(requestedCaseId) && requestedCaseId > 0;
      if (hasRequestedCase && data.some((item) => item.id === requestedCaseId)) {
        setSelectedCaseId(requestedCaseId);
      } else if (selectedCaseId === null && data.length > 0) {
        setSelectedCaseId(data[0].id);
      } else if (selectedCaseId !== null && !data.some((item) => item.id === selectedCaseId)) {
        setSelectedCaseId(data.length > 0 ? data[0].id : null);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت پرونده‌های کارآگاه'));
    } finally {
      setLoadingCases(false);
    }
  }, [searchParams, selectedCaseId]);

  const loadNotifications = useCallback(async () => {
    try {
      setLoadingNotifications(true);
      const logs = await detectiveApi.listNotifications();
      const grouped = logs.reduce<Record<number, number>>((acc, item) => {
        acc[item.case_id] = (acc[item.case_id] || 0) + 1;
        return acc;
      }, {});
      setNotificationsByCase(grouped);
    } catch {
      setNotificationsByCase({});
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const loadEvidence = async (caseId: number) => {
    try {
      setLoadingEvidence(true);
      const data = await evidenceApi.listByCase(caseId);
      setEvidenceItems(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در دریافت شواهد پرونده'));
    } finally {
      setLoadingEvidence(false);
    }
  };

  const loadBoard = async (caseId: number) => {
    try {
      setLoadingBoard(true);
      const board = await boardApi.getDetectiveBoard(caseId);
      setBoardItems(board.items || []);
      setBoardLinks(board.links || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خطا در بارگذاری تخته کارآگاه'));
      setBoardItems([]);
      setBoardLinks([]);
    } finally {
      setLoadingBoard(false);
    }
  };

  useEffect(() => {
    loadCases();
    loadNotifications();
  }, [loadCases, loadNotifications]);

  useEffect(() => {
    if (selectedCaseId === null) {
      setEvidenceItems([]);
      setBoardItems([]);
      setBoardLinks([]);
      setSelectedNomineeIds([]);
      return;
    }
    loadEvidence(selectedCaseId);
    loadBoard(selectedCaseId);
  }, [selectedCaseId]);

  useEffect(() => {
    setSelectedNomineeIds([]);
    setManualNomineeIds('');
    setNominationSummary('');
  }, [selectedCaseId]);

  const resetEvidenceForm = () => {
    setEvidenceType('other');
    setEvidenceForm(defaultEvidenceFormState());
    setIdentityFields([{ key: '', value: '' }]);
    setTranscriptionFiles([]);
    setBioImages([]);
  };

  const openEvidenceModal = () => {
    resetEvidenceForm();
    setShowEvidenceModal(true);
  };

  const closeEvidenceModal = () => {
    setShowEvidenceModal(false);
    resetEvidenceForm();
  };

  const submitEvidence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCase) {
      setError('ابتدا یک پرونده انتخاب کنید.');
      return;
    }
    if (isCaseLocked) {
      setError('به دلیل وضعیت فعلی پرونده، ثبت مدرک جدید قفل است.');
      return;
    }
    if (!evidenceForm.title.trim() || !evidenceForm.description.trim()) {
      setError('عنوان و توضیحات برای همه شواهد الزامی است.');
      return;
    }

    try {
      setSubmittingEvidence(true);
      setError('');
      setSuccess('');

      if (evidenceType === 'transcription' || evidenceType === 'bio_medical') {
        const formData = new FormData();
        formData.append('case', String(selectedCase.id));
        formData.append('title', evidenceForm.title.trim());
        formData.append('description', evidenceForm.description.trim());
        formData.append('type', evidenceType);

        if (evidenceType === 'transcription') {
          if (!evidenceForm.transcript_text.trim()) {
            throw new Error('متن استشهاد برای این نوع مدرک الزامی است.');
          }
          formData.append('transcript_text', evidenceForm.transcript_text.trim());
          transcriptionFiles.forEach((file) => formData.append('media_files', file));
        } else {
          formData.append('result_followup', evidenceForm.result_followup.trim());
          bioImages.forEach((file) => formData.append('images', file));
        }

        await evidenceApi.create(formData);
      } else {
        const payload: Record<string, unknown> = {
          case: selectedCase.id,
          title: evidenceForm.title.trim(),
          description: evidenceForm.description.trim(),
          type: evidenceType,
        };

        if (evidenceType === 'vehicle') {
          const licensePlate = evidenceForm.license_plate.trim();
          const serialNumber = evidenceForm.serial_number.trim();
          if (!evidenceForm.vehicle_model.trim() || !evidenceForm.vehicle_color.trim()) {
            throw new Error('مدل و رنگ وسیله نقلیه الزامی است.');
          }
          if ((licensePlate && serialNumber) || (!licensePlate && !serialNumber)) {
            throw new Error('فقط یکی از پلاک یا شماره سریال باید ثبت شود.');
          }
          payload.vehicle_model = evidenceForm.vehicle_model.trim();
          payload.vehicle_color = evidenceForm.vehicle_color.trim();
          payload.license_plate = licensePlate;
          payload.serial_number = serialNumber;
        } else if (evidenceType === 'identity_document') {
          if (!evidenceForm.owner_full_name.trim()) {
            throw new Error('نام کامل صاحب مدرک الزامی است.');
          }
          payload.owner_full_name = evidenceForm.owner_full_name.trim();
          const dict = identityFields.reduce<Record<string, string>>((acc, field) => {
            const key = field.key.trim();
            if (key) {
              acc[key] = field.value.trim();
            }
            return acc;
          }, {});
          payload.identity_fields = dict;
        }

        await evidenceApi.create(payload);
      }

      setSuccess('مدرک با موفقیت ثبت شد.');
      closeEvidenceModal();
      await Promise.all([loadEvidence(selectedCase.id), loadNotifications()]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ثبت مدرک با خطا مواجه شد.'));
    } finally {
      setSubmittingEvidence(false);
    }
  };

  const handleAddBoardNote = async () => {
    if (!selectedCase || !newBoardNote.trim()) return;
    if (isCaseLocked) {
      setError('ویرایش تخته برای این پرونده قفل است.');
      return;
    }
    try {
      setError('');
      const item = await boardApi.createBoardItem(selectedCase.id, {
        item_type: 'note',
        note_text: newBoardNote.trim(),
        position_x: 120 + Math.random() * 220,
        position_y: 120 + Math.random() * 220,
        width: 300,
        height: 170,
      });
      setBoardItems((prev) => [...prev, item]);
      setNewBoardNote('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'افزودن یادداشت به تخته ناموفق بود.'));
    }
  };

  const handleAddEvidenceToBoard = async (evidenceId: number) => {
    if (!selectedCase) return;
    if (isCaseLocked) {
      setError('ویرایش تخته برای این پرونده قفل است.');
      return;
    }
    try {
      setError('');
      const item = await boardApi.createBoardItem(selectedCase.id, {
        item_type: 'evidence',
        evidence: evidenceId,
        position_x: 200 + Math.random() * 280,
        position_y: 150 + Math.random() * 240,
        width: 280,
        height: 170,
      });
      setBoardItems((prev) => [...prev, item]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'افزودن مدرک به تخته ناموفق بود.'));
    }
  };

  const handleAddPersonToBoard = async (userId: number, itemType: 'witness' | 'suspect') => {
    if (!selectedCase) return;
    if (isCaseLocked) {
      setError('ویرایش تخته برای این پرونده قفل است.');
      return;
    }
    try {
      setError('');
      const item = await boardApi.createBoardItem(selectedCase.id, {
        item_type: itemType,
        user: userId,
        position_x: 160 + Math.random() * 260,
        position_y: 130 + Math.random() * 240,
        width: 260,
        height: 160,
      });
      setBoardItems((prev) => [...prev, item]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'افزودن فرد به تخته ناموفق بود.'));
    }
  };

  const handleUpdateBoardItemPosition = async (id: number, position: { x: number; y: number }) => {
    if (isCaseLocked) return;
    try {
      const updated = await boardApi.updateBoardItem(id, {
        position_x: position.x,
        position_y: position.y,
      });
      setBoardItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'به‌روزرسانی موقعیت آیتم ناموفق بود.'));
    }
  };

  const handleDeleteBoardItem = async (id: number) => {
    if (isCaseLocked) {
      setError('ویرایش تخته برای این پرونده قفل است.');
      return;
    }
    try {
      await boardApi.deleteBoardItem(id);
      setBoardItems((prev) => prev.filter((item) => item.id !== id));
      setBoardLinks((prev) => prev.filter((item) => item.from_item !== id && item.to_item !== id));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'حذف آیتم تخته ناموفق بود.'));
    }
  };

  const handleDeleteBoardLink = async (linkId: number) => {
    if (isCaseLocked) {
      setError('ویرایش تخته برای این پرونده قفل است.');
      return;
    }
    try {
      await boardApi.deleteBoardLink(linkId);
      setBoardLinks((prev) => prev.filter((item) => item.id !== linkId));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'حذف اتصال ناموفق بود.'));
    }
  };

  const handleStartConnection = () => {
    if (selectedBoardItemId) {
      setConnectingFromId(selectedBoardItemId);
    }
  };

  const handleCreateBoardLink = async (fromItem: number, toItem: number) => {
    if (!selectedCase || fromItem === toItem) {
      setConnectingFromId(null);
      return;
    }
    if (isCaseLocked) {
      setError('ویرایش تخته برای این پرونده قفل است.');
      setConnectingFromId(null);
      return;
    }
    try {
      const link = await boardApi.createBoardLink(selectedCase.id, {
        from_item: fromItem,
        to_item: toItem,
      });
      setBoardLinks((prev) => [...prev, link]);
      setConnectingFromId(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ایجاد اتصال روی تخته ناموفق بود.'));
      setConnectingFromId(null);
    }
  };

  const handleSelectBoardItem = (itemId: number) => {
    if (connectingFromId === null) {
      setSelectedBoardItemId(itemId);
      return;
    }
    handleCreateBoardLink(connectingFromId, itemId);
  };

  const handleSaveBoard = async () => {
    if (!selectedCase) return;
    try {
      setSavingBoard(true);
      await loadBoard(selectedCase.id);
      setSuccess('تخته با موفقیت همگام‌سازی شد.');
    } finally {
      setSavingBoard(false);
    }
  };

  const handleExportBoard = async () => {
    if (!boardCanvasRef.current || !selectedCase) return;
    try {
      const canvas = await html2canvas(boardCanvasRef.current, {
        backgroundColor: '#f1f5f9',
        scale: 2,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const anchor = document.createElement('a');
      anchor.download = `detective-board-case-${selectedCase.id}-${Date.now()}.png`;
      anchor.href = dataUrl;
      anchor.click();
      setLastBoardSnapshotAt(new Date().toISOString());
      setSuccess('خروجی تصویری تخته با موفقیت تولید شد.');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'خروجی تصویری تخته با خطا مواجه شد.'));
    }
  };

  const toggleNominee = (userId: number) => {
    setSelectedNomineeIds((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      return [...prev, userId];
    });
  };

  const handleNominate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCase) {
      setError('ابتدا یک پرونده انتخاب کنید.');
      return;
    }
    if (isCaseLocked) {
      setError('به دلیل وضعیت پرونده، امکان معرفی مظنون وجود ندارد.');
      return;
    }

    const mergedIds = Array.from(new Set([...selectedNomineeIds, ...parseIds(manualNomineeIds)]));
    if (mergedIds.length === 0) {
      setError('حداقل یک مظنون باید انتخاب یا وارد شود.');
      return;
    }

    let summary = nominationSummary.trim();
    if (attachBoardSnapshot) {
      const note = lastBoardSnapshotAt
        ? `ضمیمه خروجی تخته کارآگاه در ${formatDateTime(lastBoardSnapshotAt)} تهیه شد.`
        : 'ضمیمه خروجی تخته کارآگاه تهیه شده است.';
      summary = summary ? `${summary}\n${note}` : note;
    }

    try {
      setSubmittingNomination(true);
      setError('');
      setSuccess('');
      await detectiveApi.nominateSuspects(selectedCase.id, {
        suspect_ids: mergedIds,
        summary,
      });
      setSuccess('مظنونین با موفقیت به گروهبان ارسال شدند و وضعیت پرونده به در انتظار تایید گروهبان تغییر کرد.');
      await Promise.all([loadCases(), loadNotifications()]);
      setActiveTab('inbox');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'ارسال مظنونین به گروهبان ناموفق بود.'));
    } finally {
      setSubmittingNomination(false);
    }
  };

  return (
    <ProtectedModule moduleId={requiredModuleId}>
      <div className="detective-workspace">
        <header className="detective-header">
          <div>
            <h1>ماژول کارآگاه</h1>
            <p>ثبت شواهد، تحلیل بصری روی تخته، و ارسال مظنونین به گروهبان</p>
          </div>
          <div className="detective-header-meta">
            <span>پرونده‌های در دسترس: {cases.length}</span>
            <span>اعلان‌های مدرک جدید: {loadingNotifications ? '...' : notificationTotal}</span>
          </div>
        </header>

        <nav className="detective-tabs">
          {Object.entries(TAB_LABELS).map(([key, label]) => {
            const tab = key as DetectiveTab;
            return (
              <button
                key={tab}
                type="button"
                className={tab === activeTab ? 'active' : ''}
                onClick={() => setActiveTab(tab)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {(error || success) && (
          <div className={`detective-feedback ${error ? 'error' : 'success'}`}>{error || success}</div>
        )}

        <div className="detective-layout">
          <aside className="detective-cases-panel">
            <div className="panel-title-row">
              <h2>پرونده‌ها</h2>
              <button type="button" onClick={loadCases} disabled={loadingCases}>
                {loadingCases ? '...' : 'بروزرسانی'}
              </button>
            </div>

            {loadingCases ? (
              <div className="panel-empty">در حال بارگذاری پرونده‌ها...</div>
            ) : cases.length === 0 ? (
              <div className="panel-empty">پرونده‌ای برای نمایش وجود ندارد.</div>
            ) : (
              <div className="detective-case-list">
                {cases.map((item) => {
                  const isSelected = item.id === selectedCaseId;
                  const badgeCount = notificationsByCase[item.id] || 0;
                  const severity = severityLabelMap[item.severity] || `سطح ${item.severity}`;
                  const status = statusLabelMap[item.status] || item.status;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`detective-case-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedCaseId(item.id)}
                    >
                      <div className="detective-case-top">
                        <h3>#{item.id} - {item.title}</h3>
                        {badgeCount > 0 && <span className="case-badge">{badgeCount}</span>}
                      </div>
                      <div className="detective-case-meta">
                        <span>{severity}</span>
                        <span>{status}</span>
                      </div>
                      <p>{item.location}</p>
                      <small>{formatDateTime(item.incident_datetime)}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <main className="detective-main-panel">
            {!selectedCase ? (
              <div className="panel-empty">برای ادامه، یک پرونده را انتخاب کنید.</div>
            ) : (
              <>
                <section className="selected-case-summary">
                  <div>
                    <h2>
                      پرونده #{selectedCase.id}: {selectedCase.title}
                    </h2>
                    <p>{selectedCase.description}</p>
                  </div>
                  <div className="summary-badges">
                    <span>{severityLabelMap[selectedCase.severity] || `سطح ${selectedCase.severity}`}</span>
                    <span>{statusLabelMap[selectedCase.status] || selectedCase.status}</span>
                    {isCaseLocked && <span className="locked">ویرایش قفل شده</span>}
                  </div>
                </section>

                {activeTab === 'inbox' && (
                  <section className="tab-panel">
                    <h3>کارتابل پرونده‌ها</h3>
                    <p className="tab-help">
                      پرونده‌های قابل بررسی را از ستون چپ انتخاب کنید. اگر مدرک جدیدی به پرونده اضافه شود،
                      نشانگر قرمز روی کارت پرونده دیده می‌شود.
                    </p>
                    <div className="inbox-grid">
                      <article>
                        <h4>اطلاعات پایه</h4>
                        <dl>
                          <dt>زمان وقوع</dt>
                          <dd>{formatDateTime(selectedCase.incident_datetime)}</dd>
                          <dt>منبع تشکیل</dt>
                          <dd>{selectedCase.source_type === 'CrimeScene' ? 'صحنه جرم' : 'شکایت'}</dd>
                          <dt>ثبت‌کننده</dt>
                          <dd>
                            {selectedCase.created_by.first_name} {selectedCase.created_by.last_name}
                          </dd>
                        </dl>
                      </article>
                      <article>
                        <h4>افراد مرتبط پرونده</h4>
                        <ul>
                          <li>شاکی‌ها: {selectedCase.complainants.length}</li>
                          <li>شاهدها: {selectedCase.witnesses.length}</li>
                          <li>مظنون‌های فعلی: {selectedCase.suspects.length}</li>
                          <li>مدارک ثبت‌شده: {evidenceItems.length}</li>
                        </ul>
                      </article>
                      <article>
                        <h4>اعلان‌ها</h4>
                        <p>
                          تعداد اعلان‌های مدرک جدید برای این پرونده:{' '}
                          <strong>{notificationsByCase[selectedCase.id] || 0}</strong>
                        </p>
                      </article>
                    </div>
                  </section>
                )}

                {activeTab === 'evidence' && (
                  <section className="tab-panel">
                    <div className="panel-title-row">
                      <h3>ثبت و مدیریت شواهد</h3>
                      <button type="button" onClick={openEvidenceModal} disabled={isCaseLocked}>
                        ثبت مدرک جدید
                      </button>
                    </div>
                    <p className="tab-help">
                      همه مدارک باید عنوان، توضیح، تاریخ ثبت و ثبت‌کننده داشته باشند. برای وسیله نقلیه، منطق
                      XOR بین پلاک و شماره سریال اعمال می‌شود.
                    </p>

                    {loadingEvidence ? (
                      <div className="panel-empty">در حال بارگذاری مدارک...</div>
                    ) : evidenceItems.length === 0 ? (
                      <div className="panel-empty">برای این پرونده هنوز مدرکی ثبت نشده است.</div>
                    ) : (
                      <div className="evidence-list">
                        {evidenceItems.map((item) => (
                          <article key={item.id} className="evidence-card">
                            <div className="evidence-card-top">
                              <h4>
                                #{item.id} - {item.title}
                              </h4>
                              <span>{evidenceTypeLabelMap[item.type]}</span>
                            </div>
                            <p>{item.description}</p>
                            <div className="evidence-meta">
                              <span>
                                ثبت‌کننده: {item.created_by.first_name} {item.created_by.last_name}
                              </span>
                              <span>{formatDateTime(item.created_at)}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {activeTab === 'board' && (
                  <section className="tab-panel board-tab">
                    <div className="board-toolbar">
                      <div className="board-toolbar-left">
                        <button type="button" onClick={handleSaveBoard} disabled={savingBoard}>
                          {savingBoard ? 'در حال ذخیره...' : 'ذخیره و همگام‌سازی'}
                        </button>
                        <button type="button" onClick={handleExportBoard}>
                          خروجی تصویری
                        </button>
                        {selectedBoardItemId && !connectingFromId && (
                          <button type="button" onClick={handleStartConnection} disabled={isCaseLocked}>
                            شروع اتصال قرمز
                          </button>
                        )}
                        {connectingFromId && (
                          <button type="button" onClick={() => setConnectingFromId(null)}>
                            لغو اتصال
                          </button>
                        )}
                      </div>
                      <div className="zoom-controls">
                        <button type="button" onClick={() => setBoardScale((prev) => Math.max(0.5, prev - 0.1))}>
                          -
                        </button>
                        <span>{Math.round(boardScale * 100)}%</span>
                        <button type="button" onClick={() => setBoardScale((prev) => Math.min(2, prev + 0.1))}>
                          +
                        </button>
                      </div>
                    </div>

                    <div className="board-layout">
                      <aside className="board-sidebar">
                        <h4>کیسه مدارک</h4>
                        {evidenceBagItems.length === 0 ? (
                          <p className="small-empty">تمام مدارک این پرونده روی تخته قرار گرفته‌اند.</p>
                        ) : (
                          <div className="board-bag-list">
                            {evidenceBagItems.map((item) => (
                              <div key={item.id} className="bag-item">
                                <div>
                                  <strong>{item.title}</strong>
                                  <small>{evidenceTypeLabelMap[item.type]}</small>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAddEvidenceToBoard(item.id)}
                                  disabled={isCaseLocked}
                                >
                                  افزودن
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="board-note-box">
                          <label htmlFor="new-board-note">یادداشت آزاد</label>
                          <textarea
                            id="new-board-note"
                            rows={4}
                            value={newBoardNote}
                            onChange={(event) => setNewBoardNote(event.target.value)}
                            placeholder="مثال: اثر انگشت روی دسته چاقو یافت شد."
                          />
                          <button type="button" onClick={handleAddBoardNote} disabled={isCaseLocked}>
                            افزودن یادداشت
                          </button>
                        </div>

                        <div className="board-related-people">
                          <h5>افراد مرتبط</h5>
                          {caseCandidates.length === 0 ? (
                            <p className="small-empty">فرد مرتبطی در پرونده ثبت نشده است.</p>
                          ) : (
                            caseCandidates.map((person) => (
                              <div key={person.id} className="person-row">
                                <span>
                                  {person.first_name} {person.last_name}
                                </span>
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddPersonToBoard(person.id, 'witness')}
                                    disabled={isCaseLocked}
                                  >
                                    شاهد
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAddPersonToBoard(person.id, 'suspect')}
                                    disabled={isCaseLocked}
                                  >
                                    مظنون
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </aside>

                      <div className="board-canvas-wrapper">
                        {loadingBoard ? (
                          <div className="panel-empty">در حال بارگذاری تخته...</div>
                        ) : (
                          <div
                            ref={boardCanvasRef}
                            className="detective-board-canvas"
                            style={{
                              transform: `scale(${boardScale})`,
                              transformOrigin: 'top left',
                            }}
                          >
                            <BoardLinks
                              links={boardLinks}
                              items={boardItems}
                              scale={boardScale}
                              onDeleteLink={handleDeleteBoardLink}
                            />

                            {boardItems.map((item) => (
                              <BoardItem
                                key={item.id}
                                item={item}
                                onUpdate={handleUpdateBoardItemPosition}
                                onDelete={handleDeleteBoardItem}
                                onSelect={handleSelectBoardItem}
                                isSelected={item.id === selectedBoardItemId}
                                scale={boardScale}
                              />
                            ))}

                            {boardItems.length === 0 && (
                              <div className="panel-empty floating">
                                تخته خالی است. از کیسه مدارک یا یادداشت آزاد شروع کنید.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                {activeTab === 'handover' && (
                  <section className="tab-panel">
                    <h3>حل پرونده و ارسال به مافوق</h3>
                    <p className="tab-help">
                      مظنونین منتخب را با خلاصه استدلال به گروهبان ارسال کنید. پس از ارسال، وضعیت پرونده
                      به «در انتظار تایید گروهبان» می‌رود.
                    </p>

                    <form className="handover-form" onSubmit={handleNominate}>
                      <div>
                        <label>انتخاب مظنون از افراد مرتبط</label>
                        {caseCandidates.length === 0 ? (
                          <p className="small-empty">فرد مرتبط قابل انتخاب وجود ندارد. شناسه را دستی وارد کنید.</p>
                        ) : (
                          <div className="candidate-grid">
                            {caseCandidates.map((person) => (
                              <label key={person.id} className="candidate-item">
                                <input
                                  type="checkbox"
                                  checked={selectedNomineeIds.includes(person.id)}
                                  onChange={() => toggleNominee(person.id)}
                                />
                                <span>
                                  #{person.id} - {person.first_name} {person.last_name}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label htmlFor="manual-nominees">
                          ورود دستی شناسه مظنون (جداشده با کاما)
                        </label>
                        <input
                          id="manual-nominees"
                          type="text"
                          value={manualNomineeIds}
                          onChange={(event) => setManualNomineeIds(event.target.value)}
                          placeholder="مثال: 12, 34"
                        />
                      </div>

                      <div>
                        <label htmlFor="nomination-summary">خلاصه استدلال</label>
                        <textarea
                          id="nomination-summary"
                          rows={6}
                          value={nominationSummary}
                          onChange={(event) => setNominationSummary(event.target.value)}
                          placeholder="چرا این افراد مظنون هستند؟ ارتباط مدارک را توضیح دهید."
                        />
                      </div>

                      <label className="attach-checkbox">
                        <input
                          type="checkbox"
                          checked={attachBoardSnapshot}
                          onChange={(event) => setAttachBoardSnapshot(event.target.checked)}
                        />
                        <span>ضمیمه خروجی تخته در متن گزارش</span>
                      </label>

                      <button type="submit" disabled={submittingNomination || isCaseLocked}>
                        {submittingNomination ? 'در حال ارسال...' : 'ارسال به گروهبان'}
                      </button>
                    </form>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {showEvidenceModal && (
        <div className="detective-modal-overlay" onClick={closeEvidenceModal}>
          <div className="detective-modal" onClick={(event) => event.stopPropagation()}>
            <div className="detective-modal-header">
              <h3>ثبت مدرک جدید</h3>
              <button type="button" onClick={closeEvidenceModal} aria-label="بستن">
                ×
              </button>
            </div>

            <form className="evidence-form" onSubmit={submitEvidence}>
              <label htmlFor="evidence-type">نوع مدرک</label>
              <select
                id="evidence-type"
                value={evidenceType}
                onChange={(event) => setEvidenceType(event.target.value as EvidenceType)}
                disabled={submittingEvidence}
              >
                <option value="transcription">استشهاد و محتوای شاهد</option>
                <option value="bio_medical">زیستی / پزشکی</option>
                <option value="vehicle">وسیله نقلیه</option>
                <option value="identity_document">مدرک شناسایی</option>
                <option value="other">سایر موارد</option>
              </select>

              <label htmlFor="evidence-title">عنوان</label>
              <input
                id="evidence-title"
                type="text"
                value={evidenceForm.title}
                onChange={(event) =>
                  setEvidenceForm((prev) => ({ ...prev, title: event.target.value }))
                }
                required
                disabled={submittingEvidence}
              />

              <label htmlFor="evidence-description">توضیحات</label>
              <textarea
                id="evidence-description"
                rows={4}
                value={evidenceForm.description}
                onChange={(event) =>
                  setEvidenceForm((prev) => ({ ...prev, description: event.target.value }))
                }
                required
                disabled={submittingEvidence}
              />

              {evidenceType === 'transcription' && (
                <>
                  <label htmlFor="transcript-text">متن استشهاد</label>
                  <textarea
                    id="transcript-text"
                    rows={4}
                    value={evidenceForm.transcript_text}
                    onChange={(event) =>
                      setEvidenceForm((prev) => ({ ...prev, transcript_text: event.target.value }))
                    }
                    required
                    disabled={submittingEvidence}
                  />

                  <label htmlFor="transcription-files">فایل‌های صوت/تصویر</label>
                  <input
                    id="transcription-files"
                    type="file"
                    multiple
                    onChange={(event) => setTranscriptionFiles(Array.from(event.target.files || []))}
                    disabled={submittingEvidence}
                  />
                </>
              )}

              {evidenceType === 'bio_medical' && (
                <>
                  <label htmlFor="bio-followup">وضعیت پیگیری</label>
                  <textarea
                    id="bio-followup"
                    rows={3}
                    value={evidenceForm.result_followup}
                    onChange={(event) =>
                      setEvidenceForm((prev) => ({ ...prev, result_followup: event.target.value }))
                    }
                    placeholder="پیش‌فرض: Pending Lab"
                    disabled={submittingEvidence}
                  />

                  <label htmlFor="bio-images">تصاویر مدرک</label>
                  <input
                    id="bio-images"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setBioImages(Array.from(event.target.files || []))}
                    disabled={submittingEvidence}
                  />
                </>
              )}

              {evidenceType === 'vehicle' && (
                <>
                  <label htmlFor="vehicle-model">مدل وسیله نقلیه</label>
                  <input
                    id="vehicle-model"
                    type="text"
                    value={evidenceForm.vehicle_model}
                    onChange={(event) =>
                      setEvidenceForm((prev) => ({ ...prev, vehicle_model: event.target.value }))
                    }
                    required
                    disabled={submittingEvidence}
                  />

                  <label htmlFor="vehicle-color">رنگ وسیله نقلیه</label>
                  <input
                    id="vehicle-color"
                    type="text"
                    value={evidenceForm.vehicle_color}
                    onChange={(event) =>
                      setEvidenceForm((prev) => ({ ...prev, vehicle_color: event.target.value }))
                    }
                    required
                    disabled={submittingEvidence}
                  />

                  <div className="xor-row">
                    <div>
                      <label htmlFor="vehicle-plate">پلاک</label>
                      <input
                        id="vehicle-plate"
                        type="text"
                        value={evidenceForm.license_plate}
                        onChange={(event) =>
                          setEvidenceForm((prev) => ({ ...prev, license_plate: event.target.value }))
                        }
                        disabled={Boolean(evidenceForm.serial_number.trim()) || submittingEvidence}
                      />
                    </div>
                    <div>
                      <label htmlFor="vehicle-serial">شماره سریال</label>
                      <input
                        id="vehicle-serial"
                        type="text"
                        value={evidenceForm.serial_number}
                        onChange={(event) =>
                          setEvidenceForm((prev) => ({ ...prev, serial_number: event.target.value }))
                        }
                        disabled={Boolean(evidenceForm.license_plate.trim()) || submittingEvidence}
                      />
                    </div>
                  </div>
                </>
              )}

              {evidenceType === 'identity_document' && (
                <>
                  <label htmlFor="identity-owner">نام کامل صاحب مدرک</label>
                  <input
                    id="identity-owner"
                    type="text"
                    value={evidenceForm.owner_full_name}
                    onChange={(event) =>
                      setEvidenceForm((prev) => ({ ...prev, owner_full_name: event.target.value }))
                    }
                    required
                    disabled={submittingEvidence}
                  />

                  <div className="identity-fields">
                    <div className="identity-fields-head">
                      <span>فیلدهای کلید-مقدار</span>
                      <button
                        type="button"
                        onClick={() => setIdentityFields((prev) => [...prev, { key: '', value: '' }])}
                        disabled={submittingEvidence}
                      >
                        + افزودن فیلد
                      </button>
                    </div>

                    {identityFields.map((field, index) => (
                      <div key={index} className="identity-row">
                        <input
                          type="text"
                          placeholder="کلید"
                          value={field.key}
                          onChange={(event) =>
                            setIdentityFields((prev) =>
                              prev.map((item, idx) =>
                                idx === index ? { ...item, key: event.target.value } : item
                              )
                            )
                          }
                          disabled={submittingEvidence}
                        />
                        <input
                          type="text"
                          placeholder="مقدار"
                          value={field.value}
                          onChange={(event) =>
                            setIdentityFields((prev) =>
                              prev.map((item, idx) =>
                                idx === index ? { ...item, value: event.target.value } : item
                              )
                            )
                          }
                          disabled={submittingEvidence}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setIdentityFields((prev) => prev.filter((_, idx) => idx !== index))
                          }
                          disabled={submittingEvidence || identityFields.length === 1}
                        >
                          حذف
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="detective-modal-actions">
                <button type="button" onClick={closeEvidenceModal} disabled={submittingEvidence}>
                  انصراف
                </button>
                <button type="submit" disabled={submittingEvidence}>
                  {submittingEvidence ? 'در حال ثبت...' : 'ثبت مدرک'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProtectedModule>
  );
};

export default DetectiveCases;
