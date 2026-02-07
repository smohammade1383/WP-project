/**
 * Services Index
 * Central export point for all service modules
 */

export { api, default as apiClient } from './api.client';
export { authService } from './auth.service';
export { ErrorHandler } from './error.handler';
export type { ApiError } from './error.handler';
