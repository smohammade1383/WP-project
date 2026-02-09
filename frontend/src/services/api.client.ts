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
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  const name = 'csrftoken';
  const cookies = document.cookie.split(';');
  
  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.startsWith(name + '=')) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  
  return null;
}

/**
 * Ensure CSRF token is available
 * Fetches it from the server if not in cookies
 */
let csrfTokenPromise: Promise<void> | null = null;

async function ensureCsrfToken(): Promise<void> {
  // If we already have a token, no need to fetch
  if (getCsrfToken()) {
    return Promise.resolve();
  }

  // If we're already fetching, return the existing promise
  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }

  // Fetch CSRF token
  csrfTokenPromise = axios
    .get(`${BASE_URL}/users/auth/csrf/`, { withCredentials: true })
    .then(() => {
      csrfTokenPromise = null;
    })
    .catch((error) => {
      csrfTokenPromise = null;
      console.error('Failed to fetch CSRF token:', error);
    });

  return csrfTokenPromise;
}

/**
 * Create Axios instance with default configuration
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for session cookies
});

/**
 * Request Interceptor
 * Adds CSRF token to state-changing requests
 */
apiClient.interceptors.request.use(
  async (config: any) => {
    // Ensure CSRF token is available for state-changing methods
    if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase())) {
      await ensureCsrfToken();
      
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        config.headers['X-CSRFToken'] = csrfToken;
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        console.log('[API] CSRF Token:', csrfToken);
        console.log('[API] All cookies:', document.cookie);
      } else {
        console.warn('[API] No CSRF token available for request');
      }
    }
    
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handles authentication errors and redirects
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error: AxiosError) => {
    // Log error details
    console.error('[API] Request failed:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Handle 401 Unauthorized - session expired or not authenticated
    if (error.response?.status === 401) {
      console.warn('[API] Unauthorized - redirecting to login');
      authService.clearAuth();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('[API] Forbidden - CSRF token might be invalid or missing');
      console.error('[API] Response:', error.response?.data);
      // CSRF token might be missing or invalid
      // For CSRF errors, the token should be automatically included in the next request
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
