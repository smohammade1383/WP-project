import { api } from './api.client';
import type { EvidenceRecord } from './evidence.api';

const toList = <T>(payload: T[] | { results?: T[] } | null | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
};

const isBioEvidence = (item: EvidenceRecord): boolean => item.type === 'bio_medical';

export const coronerApi = {
  listBioEvidence: async (): Promise<EvidenceRecord[]> => {
    const payload = await api.get<EvidenceRecord[] | { results?: EvidenceRecord[] }>('/evidence/');
    return toList(payload).filter(isBioEvidence);
  },

  reviewBioEvidence: async (
    evidenceId: number,
    data: {
      lab_result: string;
      result_followup?: string;
      bio_validation_status: 'accepted' | 'rejected';
    }
  ): Promise<EvidenceRecord> => {
    return api.patch<EvidenceRecord>(`/evidence/${evidenceId}/`, data);
  },
};

