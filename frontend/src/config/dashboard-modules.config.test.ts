/**
 * Dashboard Modules Configuration Tests
 * Tests for role-based module filtering
 */

import { describe, it, expect } from 'vitest';
import {
  DASHBOARD_MODULES,
  getModulesForUser,
  hasModuleAccess,
} from '../config/dashboard-modules.config';

describe('Dashboard Modules Configuration', () => {
  describe('DASHBOARD_MODULES', () => {
    it('should have all required module properties', () => {
      DASHBOARD_MODULES.forEach((module) => {
        expect(module).toHaveProperty('id');
        expect(module).toHaveProperty('title');
        expect(module).toHaveProperty('description');
        expect(module).toHaveProperty('icon');
        expect(module).toHaveProperty('route');
        expect(module).toHaveProperty('allowedRoles');
        expect(module.allowedRoles).toBeInstanceOf(Array);
        expect(module.allowedRoles.length).toBeGreaterThan(0);
      });
    });

    it('should have unique module IDs', () => {
      const ids = DASHBOARD_MODULES.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique routes', () => {
      const routes = DASHBOARD_MODULES.map((m) => m.route);
      const uniqueRoutes = new Set(routes);
      expect(uniqueRoutes.size).toBe(routes.length);
    });
  });

  describe('getModulesForUser', () => {
    it('should return Basic User modules for users with no roles', () => {
      const modules = getModulesForUser([]);
      expect(modules.length).toBeGreaterThan(0);
      
      // All returned modules should allow Basic User
      modules.forEach((module) => {
        expect(module.allowedRoles).toContain('Basic User');
      });
    });

    it('should return Detective modules for Detective role', () => {
      const modules = getModulesForUser(['Detective']);
      expect(modules.length).toBeGreaterThan(0);
      
      // All returned modules should allow Detective
      modules.forEach((module) => {
        expect(module.allowedRoles).toContain('Detective');
      });
      
      // Should include detective-board
      const detectiveBoard = modules.find((m) => m.id === 'detective-board');
      expect(detectiveBoard).toBeDefined();
    });

    it('should return Administrator modules for Administrator role', () => {
      const modules = getModulesForUser(['Administrator']);
      expect(modules.length).toBeGreaterThan(0);
      
      // All returned modules should allow Administrator
      modules.forEach((module) => {
        expect(module.allowedRoles).toContain('Administrator');
      });
      
      // Should include admin-panel
      const adminPanel = modules.find((m) => m.id === 'admin-panel');
      expect(adminPanel).toBeDefined();
    });

    it('should not return Detective Board for Coroner role', () => {
      const modules = getModulesForUser(['Coroner']);
      const detectiveBoard = modules.find((m) => m.id === 'detective-board');
      expect(detectiveBoard).toBeUndefined();
    });

    it('should return Judge modules for Judge role', () => {
      const modules = getModulesForUser(['Judge']);
      expect(modules.length).toBeGreaterThan(0);
      
      // Should include judge-bench and reports
      const judgeBench = modules.find((m) => m.id === 'judge-bench');
      const reports = modules.find((m) => m.id === 'reports');
      
      expect(judgeBench).toBeDefined();
      expect(reports).toBeDefined();
    });

    it('should return combined modules for users with multiple roles', () => {
      const modules = getModulesForUser(['Detective', 'Captain']);
      expect(modules.length).toBeGreaterThan(0);
      
      // Should include modules for both roles
      const detectiveBoard = modules.find((m) => m.id === 'detective-board');
      const reports = modules.find((m) => m.id === 'reports');
      expect(detectiveBoard).toBeDefined();
      expect(reports).toBeDefined();
    });

    it('should return all common modules for all roles', () => {
      const roles = [
        'Detective',
        'Police Officer',
        'Sergeant',
        'Captain',
        'Judge',
        'Administrator',
      ];
      
      roles.forEach((role) => {
        const modules = getModulesForUser([role]);
        
        // Profile should be available to all
        const profile = modules.find((m) => m.id === 'profile');
        expect(profile).toBeDefined();
        
        // Notifications should be available to all
        const notifications = modules.find((m) => m.id === 'notifications');
        expect(notifications).toBeDefined();

        // Most wanted should be available to all
        const mostWanted = modules.find((m) => m.id === 'most-wanted');
        expect(mostWanted).toBeDefined();
      });
    });
  });

  describe('hasModuleAccess', () => {
    it('should return true when user has required role', () => {
      expect(hasModuleAccess('detective-board', ['Detective'])).toBe(true);
      expect(hasModuleAccess('admin-panel', ['Administrator'])).toBe(true);
      expect(hasModuleAccess('most-wanted', ['Police Officer'])).toBe(true);
    });

    it('should return false when user does not have required role', () => {
      expect(hasModuleAccess('detective-board', ['Coroner'])).toBe(false);
      expect(hasModuleAccess('admin-panel', ['Detective'])).toBe(false);
      expect(hasModuleAccess('reports', ['Police Officer'])).toBe(false);
    });

    it('should return false for non-existent module', () => {
      expect(hasModuleAccess('non-existent-module', ['Administrator'])).toBe(
        false
      );
    });

    it('should return true when user has one of multiple required roles', () => {
      expect(hasModuleAccess('reports', ['Chief'])).toBe(true);
      expect(hasModuleAccess('reports', ['Captain'])).toBe(true);
    });

    it('should return correct access for users with multiple roles', () => {
      expect(hasModuleAccess('detective-board', ['Detective', 'Captain'])).toBe(
        true
      );
      expect(
        hasModuleAccess('admin-panel', ['Detective', 'Administrator'])
      ).toBe(true);
    });

    it('should return true for Basic User modules with no roles', () => {
      expect(hasModuleAccess('profile', [])).toBe(true);
      expect(hasModuleAccess('notifications', [])).toBe(true);
      expect(hasModuleAccess('most-wanted', [])).toBe(true);
    });

    it('should return false for restricted modules with no roles', () => {
      expect(hasModuleAccess('detective-board', [])).toBe(false);
      expect(hasModuleAccess('admin-panel', [])).toBe(false);
      expect(hasModuleAccess('reports', [])).toBe(false);
    });
  });

  describe('Role-specific module access scenarios', () => {
    it('Detective should see detective-board but Coroner should not', () => {
      const detectiveModules = getModulesForUser(['Detective']);
      const coronerModules = getModulesForUser(['Coroner']);
      
      const detectiveHasBoard = detectiveModules.some(
        (m) => m.id === 'detective-board'
      );
      const coronerHasBoard = coronerModules.some(
        (m) => m.id === 'detective-board'
      );
      
      expect(detectiveHasBoard).toBe(true);
      expect(coronerHasBoard).toBe(false);
    });

    it('All police roles should see most-wanted module', () => {
      const policeRoles = [
        'Detective',
        'Police Officer',
        'Patrol Officer',
        'Sergeant',
        'Captain',
        'Chief',
      ];
      
      policeRoles.forEach((role) => {
        const modules = getModulesForUser([role]);
        const hasMostWanted = modules.some((m) => m.id === 'most-wanted');
        expect(hasMostWanted).toBe(true);
      });
    });

    it('Only Administrator should see admin-panel', () => {
      const adminModules = getModulesForUser(['Administrator']);
      const chiefModules = getModulesForUser(['Chief']);
      const detectiveModules = getModulesForUser(['Detective']);
      
      expect(adminModules.some((m) => m.id === 'admin-panel')).toBe(true);
      expect(chiefModules.some((m) => m.id === 'admin-panel')).toBe(false);
      expect(detectiveModules.some((m) => m.id === 'admin-panel')).toBe(false);
    });
  });
});
