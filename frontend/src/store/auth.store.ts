import { create } from 'zustand';
import { authService } from '../services/auth.service';
import { authApi, type LoginCredentials, type LoginResponse } from '../services/auth.api';

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => void;
  clearError: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: authService.isAuthenticated(),
  isLoading: false,
  error: null,

  login: async (credentials: LoginCredentials) => {
    try {
      set({ isLoading: true, error: null });
      
      const response: LoginResponse = await authApi.login(credentials);
      
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        error: error.message || 'خطا در ورود به سیستم',
        isLoading: false,
        isAuthenticated: false,
        user: null,
      });
      throw error;
    }
  },

  logout: async () => {
    try {
      set({ isLoading: true });
      await authApi.logout();
      
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // Even if API call fails, clear local auth
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error.message || 'خطا در خروج از سیستم',
      });
    }
  },

  checkAuth: () => {
    const isAuth = authService.isAuthenticated();
    set({ isAuthenticated: isAuth });
    
    if (!isAuth) {
      set({ user: null });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  setUser: (user: User | null) => {
    set({ user, isAuthenticated: !!user });
  },
}));
