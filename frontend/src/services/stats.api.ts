/**
 * Statistics API Service
 * Handles all statistics-related API calls
 */

import { api } from './api.client';

export interface AggregatedStats {
  total_cases: number;
  active_cases: number;
  solved_cases: number;
  staff_count: number;
  wanted_count: number;
}

export const statsApi = {
  /**
   * Get aggregated statistics for the home page
   * This endpoint is public and doesn't require authentication
   */
  async getAggregatedStats(): Promise<AggregatedStats> {
    return api.get<AggregatedStats>('/people/stats/');
  },
};
