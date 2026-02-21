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

export type CitizenTipStatus =
  | 'officer_review'
  | 'detective_review'
  | 'useful'
  | 'approved'
  | 'rejected';

export interface CitizenTipPerson {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  national_id: string;
  full_name: string;
}

export interface CitizenTip {
  id: number;
  reporter: CitizenTipPerson;
  case: number | null;
  suspect_profile: number | null;
  suspect_profile_case_id?: number | null;
  description: string;
  status: CitizenTipStatus;
  officer_reviewer?: CitizenTipPerson | null;
  detective_reviewer?: CitizenTipPerson | null;
  linked_evidence?: number | null;
  unique_tracking_code?: string | null;
  tracking_code?: string | null;
  reward_amount: number;
  useful_at?: string | null;
  created_at: string;
}

export const peopleApi = {
  getWantedList: async (): Promise<WantedPerson[]> => {
    return api.get<WantedPerson[]>('/people/wanted/');
  },
  getWantedDetail: async (suspectId: number): Promise<WantedPerson> => {
    return api.get<WantedPerson>(`/people/wanted/${suspectId}/`);
  },
  listTips: async (): Promise<CitizenTip[]> => {
    return api.get<CitizenTip[]>('/people/tips/');
  },
  submitTip: async (payload: {
    suspect_profile: number;
    description: string;
  }): Promise<CitizenTip> => {
    return api.post<CitizenTip>('/people/tips/', payload);
  },
  officerReviewTip: async (tipId: number, payload: { approved: boolean }): Promise<CitizenTip> => {
    return api.post<CitizenTip>(`/people/tips/${tipId}/officer-review/`, payload);
  },
  detectiveReviewTip: async (tipId: number, payload: { approved: boolean }): Promise<CitizenTip> => {
    return api.post<CitizenTip>(`/people/tips/${tipId}/detective-review/`, payload);
  },
  detectiveLinkTipToCase: async (tipId: number, payload: { case_id: number }): Promise<CitizenTip> => {
    return api.post<CitizenTip>(`/people/tips/${tipId}/link-case/`, payload);
  },
};
