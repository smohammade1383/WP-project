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
  tracking_code?: string;
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
  detectiveReview: async (
    reportId: number,
    payload: { action: 'approve' | 'reject' }
  ): Promise<RewardReport> => {
    return api.post<RewardReport>(
      `/finance/reward-reports/${reportId}/detective-review/`,
      payload
    );
  },
  verifyByCode: async (
    payload: { national_id: string; tracking_code?: string; unique_code?: string }
  ): Promise<{
    report_id: number;
    tracking_code: string;
    reward_amount: number;
    reporter: RewardReporter;
  }> => {
    const params = new URLSearchParams();
    params.set('national_id', payload.national_id);
    if (payload.tracking_code) params.set('tracking_code', payload.tracking_code);
    if (payload.unique_code) params.set('unique_code', payload.unique_code);
    return api.get(`/finance/reward-reports/verify/?${params.toString()}`);
  },
};
