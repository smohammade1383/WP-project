/**
 * Authentication API Service
 * Handles all authentication related API calls
 */

import { api } from './api.client';
import { authService } from './auth.service';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
  };
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export const authApi = {
  /**
   * Login user
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login/', credentials);
    
    // Store tokens
    authService.setToken(response.access);
    authService.setRefreshToken(response.refresh);
    
    return response;
  },

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/register/', data);
    
    // Store tokens
    authService.setToken(response.access);
    authService.setRefreshToken(response.refresh);
    
    return response;
  },

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout/');
    } finally {
      // Clear tokens regardless of API response
      authService.clearAuth();
    }
  },

  /**
   * Get current user profile
   */
  async getCurrentUser() {
    return api.get('/auth/me/');
  },

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<{ access: string }> {
    const refreshToken = authService.getRefreshToken();
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await api.post<{ access: string }>('/auth/refresh/', {
      refresh: refreshToken,
    });

    authService.setToken(response.access);
    return response;
  },
};
