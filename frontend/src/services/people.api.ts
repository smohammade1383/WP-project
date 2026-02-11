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

export const peopleApi = {
  getWantedList: async (): Promise<WantedPerson[]> => {
    return api.get<WantedPerson[]>('/people/wanted/');
  },
  getWantedDetail: async (suspectId: number): Promise<WantedPerson> => {
    return api.get<WantedPerson>(`/people/wanted/${suspectId}/`);
  },
};
