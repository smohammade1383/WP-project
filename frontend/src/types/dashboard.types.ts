/**
 * Dashboard Module Types
 * Defines the structure for modular dashboard components
 */

export interface DashboardModule {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  allowedRoles: string[];
  color?: string;
  badge?: string;
}

export interface ModuleCategory {
  category: string;
  modules: DashboardModule[];
}
