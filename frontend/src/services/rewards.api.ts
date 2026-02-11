import { api } from './api.client';

export type RewardReportStatus =
  | 'submitted'
  | 'officer_review'
  | 'detective_review'
  | 'approved'
  | 'rejected';

export interface RewardReport {
  id: number;
  case: number | null;
  suspect_profile: number | null;
  description: string;
  status: RewardReportStatus;
  unique_code: string;
  reward_amount: number;
  created_at: string;
}

export interface CreateRewardReportRequest {
  case?: number;
  suspect_profile?: number;
  description: string;
}

export const rewardsApi = {
  listMine: async (): Promise<RewardReport[]> => {
    return api.get<RewardReport[]>('/finance/reward-reports/');
  },
  create: async (payload: CreateRewardReportRequest): Promise<RewardReport> => {
    return api.post<RewardReport>('/finance/reward-reports/', payload);
  },
};
