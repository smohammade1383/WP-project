import { create } from 'zustand';

interface UIState {
  // Global loading state
  isGlobalLoading: boolean;
  loadingMessage: string | null;
  
  // Error state
  globalError: string | null;
  
  // Page-specific loading states
  pageLoading: Record<string, boolean>;
  
  // Sidebar/Menu state
  isSidebarOpen: boolean;
  
  // Actions
  setGlobalLoading: (loading: boolean, message?: string) => void;
  setGlobalError: (error: string | null) => void;
  clearGlobalError: () => void;
  setPageLoading: (page: string, loading: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isGlobalLoading: false,
  loadingMessage: null,
  globalError: null,
  pageLoading: {},
  isSidebarOpen: true,

  setGlobalLoading: (loading: boolean, message?: string) => {
    set({ 
      isGlobalLoading: loading, 
      loadingMessage: message || null 
    });
  },

  setGlobalError: (error: string | null) => {
    set({ globalError: error });
  },

  clearGlobalError: () => {
    set({ globalError: null });
  },

  setPageLoading: (page: string, loading: boolean) => {
    set((state) => ({
      pageLoading: {
        ...state.pageLoading,
        [page]: loading,
      },
    }));
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },

  setSidebarOpen: (open: boolean) => {
    set({ isSidebarOpen: open });
  },
}));
