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
  getUser: async (userId: number): Promise<User> => {
    return api.get<User>(`/users/rbac/users/${userId}/`);
  },
  updateUser: async (
    userId: number,
    payload: Partial<User> & { password?: string }
  ): Promise<User> => {
    return api.patch<User>(`/users/rbac/users/${userId}/`, payload);
  },
  deleteUser: async (userId: number): Promise<void> => {
    await api.delete(`/users/rbac/users/${userId}/`);
  },
  listRoles: async (): Promise<Role[]> => {
    return api.get<Role[]>('/users/rbac/roles/');
  },
  createRole: async (payload: { name: string; description?: string }): Promise<Role> => {
    return api.post<Role>('/users/rbac/roles/', payload);
  },
  updateRole: async (roleId: number, payload: { name?: string; description?: string }): Promise<Role> => {
    return api.patch<Role>(`/users/rbac/roles/${roleId}/`, payload);
  },
  deleteRole: async (roleId: number): Promise<void> => {
    await api.delete(`/users/rbac/roles/${roleId}/`);
  },
  addRoles: async (userId: number, roleNames: string[]): Promise<{ detail: string; roles: string[] }> => {
    return api.post(`/users/rbac/users/${userId}/roles/`, { role_names: roleNames });
  },
  removeRoles: async (userId: number, roleNames: string[]): Promise<{ detail: string; roles: string[] }> => {
    return api.delete(`/users/rbac/users/${userId}/roles/`, { data: { role_names: roleNames } });
  },
};
