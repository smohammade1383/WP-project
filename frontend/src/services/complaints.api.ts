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

export interface SecondaryComplainant {
  id: number;
  user: ComplaintUserBrief;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: ComplaintUserBrief | null;
  reviewed_by: ComplaintUserBrief | null;
  review_message: string;
  created_at: string;
  updated_at: string;
}

export interface ComplaintAttachment {
  id: number;
  file: string;
  original_name: string;
  uploaded_by: number;
  promoted_evidence: number | null;
  created_at: string;
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
  latest_review_step: 'cadet' | 'officer' | null;
  latest_review_message: string;
  complainants: ComplaintUserBrief[];
  attachments: ComplaintAttachment[];
  secondary_complainants: SecondaryComplainant[];
  created_at: string;
  updated_at: string;
}

export interface CreateComplaintRequest {
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  attachment_files?: File[];
}

export interface UpdateComplaintRequest extends Partial<CreateComplaintRequest> {
  remove_attachment_ids?: number[];
}
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

export interface OfficerReviewResponse extends ComplaintDecisionResponse {
  case: {
    id: number;
    status: string;
    severity: number;
  } | null;
}

export interface SecondaryComplainantReviewResponse {
  entry: SecondaryComplainant;
  complaint: Complaint;
}

export const complaintsApi = {
  listMine: async (): Promise<Complaint[]> => {
    return api.get<Complaint[]>('/cases/complaints/');
  },
  list: async (): Promise<Complaint[]> => {
    return api.get<Complaint[]>('/cases/complaints/');
  },
  create: async (payload: CreateComplaintRequest | FormData): Promise<Complaint> => {
    if (payload instanceof FormData) {
      return api.post<Complaint>('/cases/complaints/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post<Complaint>('/cases/complaints/', payload);
  },
  update: async (complaintId: number, payload: UpdateComplaintRequest | FormData): Promise<Complaint> => {
    if (payload instanceof FormData) {
      return api.patch<Complaint>(`/cases/complaints/${complaintId}/`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.patch<Complaint>(`/cases/complaints/${complaintId}/`, payload);
  },
  addComplainants: async (
    complaintId: number,
    payload: { complainant_ids: number[] }
  ): Promise<Complaint> => {
    return api.post<Complaint>(`/cases/complaints/${complaintId}/add-complainants/`, payload);
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
  officerReview: async (
    complaintId: number,
    payload: ComplaintDecisionRequest
  ): Promise<OfficerReviewResponse> => {
    return api.post<OfficerReviewResponse>(
      `/cases/complaints/${complaintId}/officer-review/`,
      payload
    );
  },
  listSecondaryComplainants: async (complaintId: number): Promise<SecondaryComplainant[]> => {
    return api.get<SecondaryComplainant[]>(
      `/cases/complaints/${complaintId}/secondary-complainants/`
    );
  },
  requestSecondaryComplainants: async (
    complaintId: number,
    payload: { complainant_ids: number[] }
  ): Promise<SecondaryComplainant[]> => {
    return api.post<SecondaryComplainant[]>(
      `/cases/complaints/${complaintId}/secondary-complainants/request/`,
      payload
    );
  },
  reviewSecondaryComplainant: async (
    complaintId: number,
    entryId: number,
    payload: { decision: 'approved' | 'rejected'; message?: string }
  ): Promise<SecondaryComplainantReviewResponse> => {
    return api.post<SecondaryComplainantReviewResponse>(
      `/cases/complaints/${complaintId}/secondary-complainants/${entryId}/review/`,
      payload
    );
  },
};
