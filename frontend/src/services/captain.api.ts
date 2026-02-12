import { api } from './api.client';
import type { EvidenceRecord } from './evidence.api';

export interface CaptainUserBrief {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

export interface CaptainCase {
  id: number;
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  source_type: string;
  status: string;
  severity: number;
  created_by: CaptainUserBrief;
  approved_by: CaptainUserBrief | null;
  created_at: string;
  updated_at: string;
}

export interface CaptainScore {
  id: number;
  scorer_role: 'detective' | 'sergeant';
  score: number;
  notes: string;
  created_at: string;
  scorer: CaptainUserBrief;
}

export interface CaptainSuspectProfile {
  id: number;
  case: number;
  suspect: CaptainUserBrief;
  is_arrested: boolean;
  arrest_warrant_issued: boolean;
  scores: CaptainScore[];
}

export interface CaptainDecision {
  id: number;
  suspect_profile: number;
  captain: CaptainUserBrief;
  chief: CaptainUserBrief | null;
  is_confirmed: boolean;
  chief_confirmed: boolean | null;
  summary: string;
  created_at: string;
}

const toList = <T>(payload: T[] | { results?: T[] } | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
};

export const captainApi = {
  listCases: async (): Promise<CaptainCase[]> => {
    const payload = await api.get<CaptainCase[] | { results?: CaptainCase[] }>('/cases/');
    return toList(payload);
  },

  listSuspectProfiles: async (caseId?: number): Promise<CaptainSuspectProfile[]> => {
    const params = new URLSearchParams();
    params.set('is_arrested', 'true');
    if (caseId) params.set('case', String(caseId));
    const payload = await api.get<CaptainSuspectProfile[] | { results?: CaptainSuspectProfile[] }>(
      `/cases/suspect-profiles/?${params.toString()}`
    );
    return toList(payload);
  },

  getCaseEvidence: async (caseId: number): Promise<EvidenceRecord[]> => {
    const payload = await api.get<EvidenceRecord[] | { results?: EvidenceRecord[] }>(
      `/evidence/?case=${caseId}`
    );
    return toList(payload);
  },

  submitProfileDecision: async (
    profileId: number,
    payload: { is_confirmed: boolean; summary?: string }
  ): Promise<CaptainDecision> => {
    return api.post<CaptainDecision>(`/cases/suspect-profiles/${profileId}/captain-decision/`, payload);
  },
};
