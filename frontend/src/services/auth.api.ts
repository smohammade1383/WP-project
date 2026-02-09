/**
 * Authentication API Service
 * Handles all authentication related API calls
 */

import { api } from './api.client';
import { authService } from './auth.service';

export interface LoginCredentials {
  identifier: string; // username, email, phone, or national_id
  password: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  phone_number: string;
  national_id: string;
  first_name: string;
  last_name: string;
  role_names: string[];
  is_active: boolean;
}

export interface LoginResponse {
  detail: string;
  session_expires_at: string;
  user: User;
}

export interface RegisterData {
  username: string;
  email: string;
  phone_number: string;
  national_id: string;
  password: string;
  first_name: string;
  last_name: string;
}

export const authApi = {
  /**
   * Login user with multi-identifier support
   * Supports: username, email, phone_number, national_id
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/users/auth/login/', credentials);
    
    // Store user data in session
    authService.setUserData(response.user);
    
    return response;
  },

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<User> {
    const response = await api.post<User>('/users/auth/signup/', data);
    
    // Store user data in session
    authService.setUserData(response);
    
    return response;
  },

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      await api.post('/users/auth/logout/');
    } finally {
      // Clear auth data regardless of API response
      authService.clearAuth();
    }
  },

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<User> {
    return api.get<User>('/users/auth/profile/');
  },

  /**
   * Update user profile
   */
  async updateProfile(data: Partial<User>): Promise<User> {
    const response = await api.patch<User>('/users/auth/profile/', data);
    
    // Update stored user data
    authService.setUserData(response);
    
    return response;
  },

  /**
   * Change password
   */
  async changePassword(data: {
    old_password: string;
    new_password: string;
    confirm_password: string;
  }): Promise<{ detail: string }> {
    return api.post('/users/auth/change-password/', data);
  },
};
