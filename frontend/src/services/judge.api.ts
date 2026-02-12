import { api } from './api.client';
import type { ChiefCaseReport } from './chief.api';

export interface JudgeCase {
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

export interface TrialSubmissionPayload {
  case: number;
  defendant?: number;
  verdict: 'innocent' | 'guilty';
  verdict_note: string;
  punishment_title?: string;
  punishment_description?: string;
}

const toList = <T>(payload: T[] | { results?: T[] } | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
};

export const judgeApi = {
  listCases: async (): Promise<JudgeCase[]> => {
    const payload = await api.get<JudgeCase[] | { results?: JudgeCase[] }>('/cases/');
    return toList(payload);
  },

  getCaseReport: async (caseId: number): Promise<ChiefCaseReport> => {
    return api.get<ChiefCaseReport>(`/judiciary/reports/cases/${caseId}/`);
  },

  createTrial: async (payload: TrialSubmissionPayload): Promise<Record<string, unknown>> => {
    return api.post<Record<string, unknown>>('/judiciary/trials/', payload);
  },
};
