import { useMemo } from 'react';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store';

type RoleAwareUser = {
  role_names?: unknown;
  is_superuser?: boolean;
} | null;

const ROLE_ALIASES: Record<string, string> = {
  administrator: 'Administrator',
  admin: 'Administrator',
  chief: 'Chief',
  captain: 'Captain',
  sergeant: 'Sergeant',
  sergent: 'Sergeant',
  detective: 'Detective',
  'police officer': 'Police Officer',
  officer: 'Police Officer',
  'patrol officer': 'Patrol Officer',
  patrol: 'Patrol Officer',
  cadet: 'Cadet',
  complainant: 'Complainant',
  witness: 'Witness',
  suspect: 'Suspect',
  criminal: 'Criminal',
  judge: 'Judge',
  coroner: 'Coroner',
  'basic user': 'Basic User',
  basic: 'Basic User',
  user: 'Basic User',
  'base user': 'Basic User',
};

const normalizeRole = (role: string): string => {
  const key = role.trim().toLowerCase().replace(/\s+/g, ' ');
  return ROLE_ALIASES[key] ?? role.trim();
};

export const hasAnyRole = (roles: Set<string>, expectedRoles: string[]): boolean => {
  return expectedRoles.some((role) => roles.has(normalizeRole(role)));
};

export const useRoleRouterContext = (): { isAuthenticated: boolean; roles: Set<string> } => {
  const storeUser = useAuthStore((state) => state.user as RoleAwareUser);
  const storeIsAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const fallbackUser = authService.getUserData() as RoleAwareUser;
  const user = storeUser ?? fallbackUser;

  const roles = useMemo(() => {
    const next = new Set<string>();
    const roleNames = Array.isArray(user?.role_names) ? user.role_names : [];
    roleNames.forEach((role) => {
      if (typeof role === 'string' && role.trim()) {
        next.add(normalizeRole(role));
      }
    });
    if (user?.is_superuser) {
      next.add('Administrator');
    }
    return next;
  }, [user]);

  return {
    isAuthenticated: storeIsAuthenticated || Boolean(user),
    roles,
  };
};
