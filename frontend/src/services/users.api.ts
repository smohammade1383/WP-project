import { api } from './api.client';
import type { User } from './auth.api';

export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions?: string[];
}

export const usersApi = {
  listUsers: async (query?: string): Promise<User[]> => {
    const params = query ? { q: query } : undefined;
    return api.get<User[]>('/users/rbac/users/', { params });
  },
  listRoles: async (): Promise<Role[]> => {
    return api.get<Role[]>('/users/rbac/roles/');
  },
  addRoles: async (userId: number, roleNames: string[]): Promise<{ detail: string; roles: string[] }> => {
    return api.post(`/users/rbac/users/${userId}/roles/`, { role_names: roleNames });
  },
  removeRoles: async (userId: number, roleNames: string[]): Promise<{ detail: string; roles: string[] }> => {
    return api.delete(`/users/rbac/users/${userId}/roles/`, { data: { role_names: roleNames } });
  },
};
