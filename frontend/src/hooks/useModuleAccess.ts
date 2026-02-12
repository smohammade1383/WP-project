/**
 * Module Access Hook
 * Custom hook to check if user has access to specific modules
 */

import { useMemo } from 'react';
import { authService } from '../services/auth.service';
import {
  getModulesForUser,
  hasModuleAccess,
} from '../config/dashboard-modules.config';
import type { DashboardModule } from '../types/dashboard.types';

interface UseModuleAccess {
  userRoles: string[];
  availableModules: DashboardModule[];
  hasAccess: (moduleId: string) => boolean;
  isLoading: boolean;
}

/**
 * useModuleAccess Hook
 * Returns user's available modules and access checking function
 */
export const useModuleAccess = (): UseModuleAccess => {
  const user = authService.getUserData();
  const userRoles = useMemo(() => {
    const roles = new Set<string>(user?.role_names || []);
    if (user?.is_superuser) {
      roles.add('Administrator');
    }
    return Array.from(roles);
  }, [user]);

  const availableModules = useMemo(() => {
    return getModulesForUser(userRoles);
  }, [userRoles]);

  const hasAccess = (moduleId: string) => {
    return hasModuleAccess(moduleId, userRoles);
  };

  return {
    userRoles,
    availableModules,
    hasAccess,
    isLoading: false, // Can be extended to handle async loading
  };
};
