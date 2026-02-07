/**
 * Cases API Service
 * Handles all case-related API calls
 */

import { api } from './api.client';

export interface Case {
  id: number;
  case_number: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CaseListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Case[];
}

export const casesApi = {
  /**
   * Get all cases with pagination
   */
  async getCases(page = 1, pageSize = 10): Promise<CaseListResponse> {
    return api.get<CaseListResponse>(`/cases/?page=${page}&page_size=${pageSize}`);
  },

  /**
   * Get single case by ID
   */
  async getCase(id: number): Promise<Case> {
    return api.get<Case>(`/cases/${id}/`);
  },

  /**
   * Create new case
   */
  async createCase(data: Partial<Case>): Promise<Case> {
    return api.post<Case>('/cases/', data);
  },

  /**
   * Update existing case
   */
  async updateCase(id: number, data: Partial<Case>): Promise<Case> {
    return api.put<Case>(`/cases/${id}/`, data);
  },

  /**
   * Partially update case
   */
  async patchCase(id: number, data: Partial<Case>): Promise<Case> {
    return api.patch<Case>(`/cases/${id}/`, data);
  },

  /**
   * Delete case
   */
  async deleteCase(id: number): Promise<void> {
    return api.delete(`/cases/${id}/`);
  },
};
