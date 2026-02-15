import { api } from './api.client';

export type EvidenceType =
  | 'transcription'
  | 'bio_medical'
  | 'vehicle'
  | 'identity_document'
  | 'other';

export interface EvidenceUserBrief {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

export interface EvidenceRecord {
  id: number;
  case: number;
  case_title?: string;
  case_status?: string;
  case_severity?: number;
  title: string;
  description: string;
  type: EvidenceType;
  created_by: EvidenceUserBrief;
  officer_review_status: 'pending' | 'approved' | 'rejected';
  officer_reviewer: EvidenceUserBrief | null;
  officer_reviewed_at: string | null;
  officer_review_message: string;
  created_at: string;
  details: Record<string, unknown>;
}

export interface EvidenceOfficerReviewPayload {
  decision: 'approved' | 'rejected';
  message?: string;
}

const toList = <T>(payload: T[] | { results?: T[] } | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
};

export const evidenceApi = {
  listByCase: async (caseId: number): Promise<EvidenceRecord[]> => {
    const payload = await api.get<EvidenceRecord[] | { results?: EvidenceRecord[] }>(
      `/evidence/?case=${caseId}`
    );
    return toList(payload);
  },

  listOfficerPending: async (): Promise<EvidenceRecord[]> => {
    const payload = await api.get<EvidenceRecord[] | { results?: EvidenceRecord[] }>(
      '/evidence/officer/pending/'
    );
    return toList(payload);
  },

  create: async (
    payload: Record<string, unknown> | FormData
  ): Promise<EvidenceRecord> => {
    if (payload instanceof FormData) {
      return api.post<EvidenceRecord>('/evidence/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post<EvidenceRecord>('/evidence/', payload);
  },

  officerReview: async (evidenceId: number, payload: EvidenceOfficerReviewPayload): Promise<EvidenceRecord> => {
    return api.post<EvidenceRecord>(`/evidence/${evidenceId}/officer-review/`, payload);
  },
};
