/**
 * Token Management Service
 * Handles storing and retrieving authentication tokens
 */

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_DATA_KEY = 'user_data';

export const authService = {
  /**
   * Store access token in localStorage
   */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },

  /**
   * Get access token from localStorage
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Remove access token from localStorage
   */
  removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  /**
   * Store refresh token in localStorage
   */
  setRefreshToken(token: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },

  /**
   * Get refresh token from localStorage
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Remove refresh token from localStorage
   */
  removeRefreshToken(): void {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },

  /**
   * Store user data
   */
  setUserData(user: any): void {
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
  },

  /**
   * Get user data
   */
  getUserData(): any | null {
    const data = localStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  },

  /**
   * Remove user data
   */
  removeUserData(): void {
    localStorage.removeItem(USER_DATA_KEY);
  },

  /**
   * Clear all authentication data
   */
  clearAuth(): void {
    this.removeToken();
    this.removeRefreshToken();
    this.removeUserData();
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getUserData();
  },
};
