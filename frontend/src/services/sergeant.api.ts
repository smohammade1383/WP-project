import { api } from './api.client';

export interface SergeantUserBrief {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  national_id?: string;
}

export interface SergeantCase {
  id: number;
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  source_type: 'Complaint' | 'CrimeScene';
  status: string;
  severity: number;
  created_by: SergeantUserBrief;
  approved_by: SergeantUserBrief | null;
  updated_at: string;
  created_at: string;
}

export interface SergeantProfileScore {
  id: number;
  scorer_role: 'detective' | 'sergeant';
  score: number;
  notes: string;
  created_at: string;
  scorer: SergeantUserBrief;
}

export interface SergeantSuspectProfile {
  id: number;
  case: number;
  suspect: SergeantUserBrief;
  wanted_since: string;
  wanted_days: number;
  arrest_warrant_issued: boolean;
  is_arrested: boolean;
  severe_tracking: boolean;
  public_photo: string;
  public_details: string;
  ranking_score: number;
  reward_amount: number;
  scores: SergeantProfileScore[];
}

export interface SergeantDecisionResponse {
  case_id: number;
  approved: boolean;
  message: string;
}

export interface PaymentInitiationResult {
  transaction: {
    id: number;
    amount: number;
    status: string;
    transaction_type: string;
    gateway_reference: string;
  };
  payment_url: string;
}

export interface SubmitToCaptainResult {
  case: SergeantCase;
  submitted_profiles: number;
  message: string;
}

const toList = <T>(payload: T[] | { results?: T[] } | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
};

type SuspectProfileQuery = {
  caseId?: number;
  arrestWarrantIssued?: boolean;
  isArrested?: boolean;
};

export const sergeantApi = {
  listCases: async (): Promise<SergeantCase[]> => {
    const payload = await api.get<SergeantCase[] | { results?: SergeantCase[] }>('/cases/');
    return toList(payload);
  },

  approveCrimeScene: async (caseId: number): Promise<SergeantCase> => {
    return api.post<SergeantCase>(`/cases/${caseId}/crime-scene-approve/`, {});
  },

  listSuspectProfiles: async (query: SuspectProfileQuery = {}): Promise<SergeantSuspectProfile[]> => {
    const params = new URLSearchParams();
    if (query.caseId) params.set('case', String(query.caseId));
    if (typeof query.arrestWarrantIssued === 'boolean') {
      params.set('arrest_warrant_issued', query.arrestWarrantIssued ? 'true' : 'false');
    }
    if (typeof query.isArrested === 'boolean') {
      params.set('is_arrested', query.isArrested ? 'true' : 'false');
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const payload = await api.get<SergeantSuspectProfile[] | { results?: SergeantSuspectProfile[] }>(
      `/cases/suspect-profiles/${suffix}`
    );
    return toList(payload);
  },

  submitSergeantDecision: async (
    caseId: number,
    payload: { approved: boolean; message?: string }
  ): Promise<SergeantDecisionResponse> => {
    return api.post<SergeantDecisionResponse>(`/cases/${caseId}/suspects/sergeant-decision/`, payload);
  },

  markArrested: async (profileId: number): Promise<SergeantSuspectProfile> => {
    return api.post<SergeantSuspectProfile>(`/cases/suspect-profiles/${profileId}/arrest/`, {});
  },

  submitInterrogationScore: async (
    profileId: number,
    payload: { score: number; notes?: string }
  ): Promise<SergeantProfileScore> => {
    return api.post<SergeantProfileScore>(`/cases/suspect-profiles/${profileId}/score/`, {
      scorer_role: 'sergeant',
      score: payload.score,
      notes: payload.notes || '',
    });
  },

  initiateBail: async (payload: {
    suspect_profile: number;
    amount: number;
    transaction_type: 'bail' | 'fine';
    return_url?: string;
  }): Promise<PaymentInitiationResult> => {
    return api.post<PaymentInitiationResult>('/finance/payments/initiate/', {
      ...payload,
      sergeant_approved: true,
    });
  },

  submitToCaptain: async (caseId: number, payload: { message?: string }): Promise<SubmitToCaptainResult> => {
    return api.post<SubmitToCaptainResult>(`/cases/${caseId}/submit-to-captain/`, payload);
  },
};
