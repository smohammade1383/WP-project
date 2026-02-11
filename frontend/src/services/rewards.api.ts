import { api } from './api.client';

export type RewardReportStatus =
  | 'submitted'
  | 'officer_review'
  | 'detective_review'
  | 'approved'
  | 'rejected';

export interface RewardReporter {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  national_id: string;
}

export interface RewardReport {
  id: number;
  reporter?: RewardReporter;
  case: number | null;
  suspect_profile: number | null;
  description: string;
  status: RewardReportStatus;
  unique_code: string;
  reward_amount: number;
  reviewed_by_officer?: number | null;
  reviewed_by_detective?: number | null;
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
  list: async (): Promise<RewardReport[]> => {
    return api.get<RewardReport[]>('/finance/reward-reports/');
  },
  create: async (payload: CreateRewardReportRequest): Promise<RewardReport> => {
    return api.post<RewardReport>('/finance/reward-reports/', payload);
  },
  officerReview: async (
    reportId: number,
    payload: { action: 'forward' | 'reject' }
  ): Promise<RewardReport> => {
    return api.post<RewardReport>(
      `/finance/reward-reports/${reportId}/officer-review/`,
      payload
    );
  },
};
