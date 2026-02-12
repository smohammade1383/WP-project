import { beforeEach, describe, expect, it } from 'vitest';
import { authService } from './auth.service';

describe('authService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and clears token values', () => {
    authService.setToken('access-token');
    authService.setRefreshToken('refresh-token');

    expect(authService.getToken()).toBe('access-token');
    expect(authService.getRefreshToken()).toBe('refresh-token');

    authService.clearAuth();
    expect(authService.getToken()).toBeNull();
    expect(authService.getRefreshToken()).toBeNull();
  });

  it('stores user data and reports authenticated state', () => {
    expect(authService.isAuthenticated()).toBe(false);

    authService.setUserData({
      id: 1,
      username: 'tester',
      role_names: ['Basic User'],
    });

    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getUserData()).toEqual({
      id: 1,
      username: 'tester',
      role_names: ['Basic User'],
    });
  });
});

