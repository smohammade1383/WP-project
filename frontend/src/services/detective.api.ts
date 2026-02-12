import { api } from './api.client';

export interface DetectiveCaseUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  national_id?: string;
}

export interface LocalWitness {
  id: number;
  full_name: string;
  national_id: string;
  phone_number: string;
}

export interface DetectiveCase {
  id: number;
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  source_type: string;
  status: string;
  severity: number;
  created_by: DetectiveCaseUser;
  approved_by: DetectiveCaseUser | null;
  complainants: DetectiveCaseUser[];
  witnesses: DetectiveCaseUser[];
  suspects: DetectiveCaseUser[];
  local_witnesses: LocalWitness[];
  created_at: string;
  updated_at: string;
}

export interface DetectiveNotification {
  id: number;
  case_id: number;
  action: string;
  description: string;
  timestamp: string;
}

export interface DetectiveInterrogationScore {
  id: number;
  scorer_role: 'detective' | 'sergeant';
  score: number;
  notes: string;
  created_at: string;
  scorer: DetectiveCaseUser;
}

export interface DetectiveSuspectProfile {
  id: number;
  case: number;
  suspect: DetectiveCaseUser;
  wanted_since: string;
  arrest_warrant_issued: boolean;
  is_arrested: boolean;
  severe_tracking: boolean;
  scores: DetectiveInterrogationScore[];
}

interface NominateSuspectsRequest {
  suspect_ids: number[];
  summary?: string;
}

const toList = <T>(payload: T[] | { results?: T[] } | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
};

export const detectiveApi = {
  listCases: async (): Promise<DetectiveCase[]> => {
    const payload = await api.get<DetectiveCase[] | { results?: DetectiveCase[] }>('/cases/');
    return toList(payload);
  },

  listNotifications: async (): Promise<DetectiveNotification[]> => {
    const payload = await api.get<DetectiveNotification[] | { results?: DetectiveNotification[] }>(
      '/cases/notifications/detective/'
    );
    return toList(payload);
  },

  nominateSuspects: async (
    caseId: number,
    payload: NominateSuspectsRequest
  ): Promise<Record<string, unknown>> => {
    return api.post<Record<string, unknown>>(`/cases/${caseId}/suspects/nominate/`, payload);
  },

  listSuspectProfiles: async (caseId: number): Promise<DetectiveSuspectProfile[]> => {
    const payload = await api.get<DetectiveSuspectProfile[] | { results?: DetectiveSuspectProfile[] }>(
      `/cases/suspect-profiles/?case=${caseId}`
    );
    return toList(payload);
  },

  submitDetectiveScore: async (
    profileId: number,
    payload: { score: number; notes?: string }
  ): Promise<DetectiveInterrogationScore> => {
    return api.post<DetectiveInterrogationScore>(`/cases/suspect-profiles/${profileId}/score/`, {
      scorer_role: 'detective',
      score: payload.score,
      notes: payload.notes || '',
    });
  },
};
