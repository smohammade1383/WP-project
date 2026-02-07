import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { authService } from './auth.service';
import { ErrorHandler } from './error.handler';

/**
 * API Client Configuration
 * Base URL should be set according to your Django backend
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

/**
 * Create Axios instance with default configuration
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor
 * Adds authentication token to all requests
 */
apiClient.interceptors.request.use(
  (config: any) => {
    const token = authService.getToken();
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handles token refresh and error responses
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest: any = error.config;

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = authService.getRefreshToken();
        
        if (refreshToken) {
          // Try to refresh the token
          const response = await axios.post(`${BASE_URL}/auth/refresh/`, {
            refresh: refreshToken,
          });

          const { access } = response.data;
          authService.setToken(access);

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${access}`;
          return apiClient(originalRequest);
        } else {
          // No refresh token, redirect to login
          authService.clearAuth();
          window.location.href = '/login';
        }
      } catch (refreshError) {
        // Refresh failed, clear auth and redirect to login
        authService.clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Access forbidden:', error.response.data);
      // You can redirect to an access denied page or show a message
    }

    // Handle error and show to user
    const apiError = ErrorHandler.handleError(error);
    ErrorHandler.showError(apiError);

    return Promise.reject(apiError);
  }
);

/**
 * API Service Methods
 */
export const api = {
  /**
   * GET request
   */
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.get<T>(url, config).then((response) => response.data);
  },

  /**
   * POST request
   */
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.post<T>(url, data, config).then((response) => response.data);
  },

  /**
   * PUT request
   */
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.put<T>(url, data, config).then((response) => response.data);
  },

  /**
   * PATCH request
   */
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.patch<T>(url, data, config).then((response) => response.data);
  },

  /**
   * DELETE request
   */
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.delete<T>(url, config).then((response) => response.data);
  },
};

export default apiClient;
