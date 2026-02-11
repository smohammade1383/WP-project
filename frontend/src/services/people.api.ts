import { api } from './api.client';

export interface PublicPerson {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  national_id: string;
  full_name: string;
}

export interface WantedPerson {
  id: number;
  case_id: number;
  case_severity: number;
  suspect: PublicPerson;
  wanted_since: string;
  wanted_days: number;
  severe_tracking: boolean;
  public_photo?: string;
  public_details?: string;
  ranking_score: number;
  reward_amount: number;
}

export interface CreateCitizenTipRequest {
  case?: number;
  suspect_profile?: number;
  description: string;
}

export interface CitizenTip {
  id: number;
  reporter: number;
  case: number | null;
  suspect_profile: number | null;
  description: string;
  status: 'officer_review' | 'detective_review' | 'approved';
  officer_reviewer: number | null;
  detective_reviewer: number | null;
  created_at: string;
}

export const peopleApi = {
  getWantedList: async (): Promise<WantedPerson[]> => {
    return api.get<WantedPerson[]>('/people/wanted/');
  },
  getWantedDetail: async (suspectId: number): Promise<WantedPerson> => {
    return api.get<WantedPerson>(`/people/wanted/${suspectId}/`);
  },
  submitTip: async (payload: CreateCitizenTipRequest): Promise<CitizenTip> => {
    return api.post<CitizenTip>('/people/tips/', payload);
  },
};
