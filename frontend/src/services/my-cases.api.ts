import { api } from './api.client';

export interface CitizenCaseSummary {
  id: number;
  case_code: string;
  title: string;
  source_type: 'Complaint' | 'CrimeScene';
  status: string;
  severity: number;
  incident_datetime: string;
  created_at: string;
  updated_at: string;
  my_role: 'case_owner' | 'complainant' | 'witness' | 'suspect' | 'viewer';
  general_summary: string;
  my_evidence_count: number;
  total_evidence_count: number;
}

export const myCasesApi = {
  listSummaries: async (): Promise<CitizenCaseSummary[]> => {
    return api.get<CitizenCaseSummary[]>('/cases/my-cases/summary/');
  },
};
