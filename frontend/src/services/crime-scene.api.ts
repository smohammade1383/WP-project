import { api } from './api.client';

export interface CrimeSceneCase {
  id: number;
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  source_type: string;
  status: string;
  severity: number;
  created_at: string;
}

export interface CreateCrimeSceneCaseRequest {
  title: string;
  description: string;
  location: string;
  incident_datetime: string;
  severity: number;
  local_witnesses?: Array<{
    full_name?: string;
    national_id: string;
    phone_number: string;
  }>;
}

export const crimeSceneApi = {
  create: async (payload: CreateCrimeSceneCaseRequest): Promise<CrimeSceneCase> => {
    return api.post<CrimeSceneCase>('/cases/crime-scene-reports/', payload);
  },
};
