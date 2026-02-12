import { api } from './api.client';

export interface ChiefCase {
  id: number;
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  source_type: string;
  status: string;
  severity: number;
  created_at: string;
  updated_at: string;
}

export interface ChiefStats {
  total_cases: number;
  active_cases: number;
  solved_cases: number;
  staff_count: number;
  wanted_count: number;
}

export interface ChiefReportPerson {
  id: number;
  username: string;
  name: string;
  rank: string;
  roles: string[];
}

export interface ChiefReportInvolvedPerson {
  name: string;
  rank: string;
  role: string;
  action_date: string;
}

export interface ChiefBoardSnapshotItem {
  id: number;
  item_type: string;
  note_text: string;
  evidence_id: number | null;
  evidence_title: string;
  user_id: number | null;
  user_name: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface ChiefBoardSnapshotLink {
  id: number;
  from_item: number;
  to_item: number;
  description: string;
}

export interface ChiefCaseReport {
  case: Record<string, unknown>;
  complaints: Record<string, unknown>[];
  evidence: Record<string, unknown>[];
  suspect_profiles: Record<string, unknown>[];
  trials: Record<string, unknown>[];
  complainants: ChiefReportPerson[];
  criminals: ChiefReportPerson[];
  involved_personnel: ChiefReportInvolvedPerson[];
  pending_chief_decision_ids: number[];
  board_snapshot: {
    id: number;
    detective: {
      id: number;
      name: string;
      rank: string;
    };
    items: ChiefBoardSnapshotItem[];
    links: ChiefBoardSnapshotLink[];
  } | null;
}

const toList = <T>(payload: T[] | { results?: T[] } | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
};

export const chiefApi = {
  listCases: async (): Promise<ChiefCase[]> => {
    const payload = await api.get<ChiefCase[] | { results?: ChiefCase[] }>('/cases/');
    return toList(payload);
  },

  getStats: async (): Promise<ChiefStats> => {
    return api.get<ChiefStats>('/cases/stats/aggregated/');
  },

  getCaseReport: async (caseId: number): Promise<ChiefCaseReport> => {
    return api.get<ChiefCaseReport>(`/judiciary/reports/cases/${caseId}/`);
  },

  submitChiefDecision: async (
    decisionId: number,
    payload: { chief_confirmed: boolean; summary?: string }
  ): Promise<Record<string, unknown>> => {
    return api.post<Record<string, unknown>>(
      `/cases/captain-decisions/${decisionId}/chief-decision/`,
      payload
    );
  },
};
