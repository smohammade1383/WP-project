import type { ReactNode } from 'react';
import type { ChiefCaseReport } from '../services';
import './CaseDossier.css';

interface CaseDossierProps {
  report: ChiefCaseReport;
  actionPanel?: ReactNode;
}

const asString = (value: unknown, fallback = '-'): string => {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') return String(value);
  return fallback;
};

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDate = (value: unknown): string => {
  if (typeof value !== 'string' || !value) return '-';
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

const CaseDossier = ({ report, actionPanel }: CaseDossierProps) => {
  const caseData = report.case || {};
  const caseId = asNumber(caseData.id);
  const caseTitle = asString(caseData.title, `پرونده #${caseId}`);
  const caseSeverity = asNumber(caseData.severity);
  const caseStatusRaw = asString(caseData.status);
  const caseStatus = statusLabelMap[caseStatusRaw] || caseStatusRaw;

  return (
    <div className="case-dossier">
      <header className="case-dossier-header">
        <div>
          <h2>
            گزارش جامع پرونده #{caseId} - {caseTitle}
          </h2>
          <p>{asString(caseData.description)}</p>
        </div>
        <button type="button" className="print-btn no-print" onClick={() => window.print()}>
          چاپ گزارش
        </button>
      </header>

      {actionPanel ? <div className="no-print">{actionPanel}</div> : null}

      <section className="dossier-section">
        <h3>Case Metadata</h3>
        <div className="metadata-grid">
          <div>
            <span>وضعیت</span>
            <strong>{caseStatus}</strong>
          </div>
          <div>
            <span>شدت جرم</span>
            <strong>{severityLabelMap[caseSeverity] || caseSeverity}</strong>
          </div>
          <div>
            <span>منبع تشکیل</span>
            <strong>{asString(caseData.source_type)}</strong>
          </div>
          <div>
            <span>مکان</span>
            <strong>{asString(caseData.location)}</strong>
          </div>
          <div>
            <span>زمان وقوع</span>
            <strong>{formatDate(caseData.incident_datetime)}</strong>
          </div>
          <div>
            <span>تاریخ تشکیل</span>
            <strong>{formatDate(caseData.created_at)}</strong>
          </div>
        </div>
      </section>

      <section className="dossier-section">
        <h3>Involved Personnel</h3>
        {report.involved_personnel.length === 0 ? (
          <p className="section-empty">فرد دخیل ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table className="dossier-table">
              <thead>
                <tr>
                  <th>نام</th>
                  <th>Rank</th>
                  <th>Role</th>
                  <th>آخرین تاریخ اقدام</th>
                </tr>
              </thead>
              <tbody>
                {report.involved_personnel.map((person, idx) => (
                  <tr key={`${person.name}-${person.action_date}-${idx}`}>
                    <td>{person.name}</td>
                    <td>{person.rank}</td>
                    <td>{person.role}</td>
                    <td>{formatDate(person.action_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dossier-section">
        <h3>Suspects & Criminals</h3>
        <div className="dual-grid">
          <article>
            <h4>مظنونین</h4>
            {report.suspect_profiles.length === 0 ? (
              <p className="section-empty">مظنونی ثبت نشده است.</p>
            ) : (
              <ul className="dossier-list">
                {report.suspect_profiles.map((profile) => {
                  const suspect = (profile.suspect || {}) as Record<string, unknown>;
                  const isArrested = Boolean(profile.is_arrested);
                  return (
                    <li key={asNumber(profile.profile_id)}>
                      <strong>{asString(suspect.username)}</strong>
                      <span>شناسه ملی: {asString(suspect.national_id)}</span>
                      <span>بازداشت: {isArrested ? 'بله' : 'خیر'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
          <article>
            <h4>مجرمان (بر اساس حکم guilty)</h4>
            {report.criminals.length === 0 ? (
              <p className="section-empty">مجرم نهایی ثبت نشده است.</p>
            ) : (
              <ul className="dossier-list">
                {report.criminals.map((person) => (
                  <li key={person.id}>
                    <strong>{person.name}</strong>
                    <span>{person.username}</span>
                    <span>{person.rank}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </section>

      <section className="dossier-section">
        <h3>Complainants</h3>
        {report.complainants.length === 0 ? (
          <p className="section-empty">شاکی ثبت نشده است.</p>
        ) : (
          <ul className="dossier-list compact">
            {report.complainants.map((person) => (
              <li key={person.id}>
                <strong>{person.name}</strong>
                <span>{person.username}</span>
                <span>{person.rank}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dossier-section">
        <h3>Evidence List</h3>
        {report.evidence.length === 0 ? (
          <p className="section-empty">مدرکی ثبت نشده است.</p>
        ) : (
          <div className="evidence-grid">
            {report.evidence.map((item) => (
              <article key={asNumber(item.id)} className="evidence-card">
                <h4>
                  #{asNumber(item.id)} - {asString(item.title)}
                </h4>
                <p>{asString(item.description)}</p>
                <div className="evidence-meta">
                  <span>نوع: {asString(item.type)}</span>
                  <span>ثبت: {formatDate(item.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="dossier-section">
        <h3>Detective Board Snapshot</h3>
        {!report.board_snapshot ? (
          <p className="section-empty">اسنپ‌شات تخته کارآگاه موجود نیست.</p>
        ) : (
          <div className="board-snapshot">
            <div className="snapshot-header">
              <span>Detective: {report.board_snapshot.detective.name}</span>
              <span>Items: {report.board_snapshot.items.length}</span>
              <span>Links: {report.board_snapshot.links.length}</span>
            </div>
            <div className="snapshot-grid">
              {report.board_snapshot.items.map((item) => (
                <article key={item.id} className="snapshot-item">
                  <strong>#{item.id}</strong>
                  <span>{item.item_type}</span>
                  {item.evidence_title ? <span>{item.evidence_title}</span> : null}
                  {item.note_text ? <p>{item.note_text}</p> : null}
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default CaseDossier;
