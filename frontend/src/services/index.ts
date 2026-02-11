/**
 * Services Index
 * Central export point for all service modules
 */

export { api, default as apiClient } from './api.client';
export { authService } from './auth.service';
export { authApi } from './auth.api';
export type { LoginCredentials, RegisterData, User, LoginResponse } from './auth.api';
export { ErrorHandler } from './error.handler';
export type { ApiError } from './error.handler';
export { statsApi } from './stats.api';
export type { AggregatedStats } from './stats.api';
export { peopleApi } from './people.api';
export type { PublicPerson, WantedPerson } from './people.api';
