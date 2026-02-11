import { api } from './api.client';

export type ComplaintStatus =
  | 'submitted'
  | 'returned'
  | 'approved'
  | 'rejected'
  | 'void';

export interface ComplaintUserBrief {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  national_id: string;
}

export interface Complaint {
  id: number;
  case: number | null;
  submitter: ComplaintUserBrief;
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  status: ComplaintStatus;
  invalid_attempt_count: number;
  latest_review_decision: 'approved' | 'returned' | 'rejected' | null;
  latest_review_message: string;
  complainants: ComplaintUserBrief[];
  created_at: string;
  updated_at: string;
}

export interface CreateComplaintRequest {
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
}

export type UpdateComplaintRequest = Partial<CreateComplaintRequest>;
export type ComplaintDecision = 'approved' | 'returned' | 'rejected';

export interface ComplaintReview {
  id: number;
  complaint: number;
  reviewer: ComplaintUserBrief;
  step: 'cadet' | 'officer';
  decision: ComplaintDecision;
  message: string;
  created_at: string;
}

export interface ComplaintDecisionRequest {
  decision: ComplaintDecision;
  message?: string;
}

export interface ComplaintDecisionResponse {
  complaint: Complaint;
  review: ComplaintReview;
}

export const complaintsApi = {
  listMine: async (): Promise<Complaint[]> => {
    return api.get<Complaint[]>('/cases/complaints/');
  },
  list: async (): Promise<Complaint[]> => {
    return api.get<Complaint[]>('/cases/complaints/');
  },
  create: async (payload: CreateComplaintRequest): Promise<Complaint> => {
    return api.post<Complaint>('/cases/complaints/', payload);
  },
  update: async (complaintId: number, payload: UpdateComplaintRequest): Promise<Complaint> => {
    return api.patch<Complaint>(`/cases/complaints/${complaintId}/`, payload);
  },
  cadetReview: async (
    complaintId: number,
    payload: ComplaintDecisionRequest
  ): Promise<ComplaintDecisionResponse> => {
    return api.post<ComplaintDecisionResponse>(
      `/cases/complaints/${complaintId}/cadet-review/`,
      payload
    );
  },
};
