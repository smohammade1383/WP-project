import { describe, expect, it } from 'vitest';
import { getModulesForUser, hasModuleAccess } from './dashboard-modules.config';

describe('dashboard modules config', () => {
  it('returns basic-user modules when no role is provided', () => {
    const modules = getModulesForUser([]);
    const moduleIds = modules.map((item) => item.id);

    expect(moduleIds).toContain('most-wanted');
    expect(moduleIds).toContain('profile');
    expect(moduleIds).toContain('citizen-complaints');
    expect(moduleIds).not.toContain('detective-board');
  });

  it('returns detective modules for detective role', () => {
    const modules = getModulesForUser(['Detective']);
    const moduleIds = modules.map((item) => item.id);

    expect(moduleIds).toContain('detective-cases');
    expect(moduleIds).toContain('detective-board');
    expect(moduleIds).toContain('detective-rewards');
    expect(moduleIds).toContain('reward-verification');
    expect(moduleIds).not.toContain('coroner-lab');
  });

  it('checks module access using role mapping', () => {
    expect(hasModuleAccess('officer-crime-scene', ['Sergeant'])).toBe(true);
    expect(hasModuleAccess('reward-verification', ['Cadet'])).toBe(true);
    expect(hasModuleAccess('judge-bench', ['Sergeant'])).toBe(false);
    expect(hasModuleAccess('unknown-module-id', ['Administrator'])).toBe(false);
  });
});
