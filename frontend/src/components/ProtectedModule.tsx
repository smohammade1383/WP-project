/**
 * Protected Route Component
 * Wraps components that require specific module access
 */

import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/auth.service';
import { hasModuleAccess } from '../config/dashboard-modules.config';

interface ProtectedModuleProps {
  moduleId: string;
  children: ReactNode;
  redirectTo?: string;
  fallback?: ReactNode;
}

/**
 * ProtectedModule Component
 * Renders children only if user has access to the specified module
 * Otherwise redirects to specified path or shows fallback content
 */
const ProtectedModule = ({
  moduleId,
  children,
  redirectTo = '/dashboard',
  fallback,
}: ProtectedModuleProps) => {
  const user = authService.getUserData();
  const userRoles = user?.role_names || [];

  const hasAccess = hasModuleAccess(moduleId, userRoles);

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default ProtectedModule;
