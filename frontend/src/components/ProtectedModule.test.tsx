import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import ProtectedModule from './ProtectedModule';
import { authService } from '../services/auth.service';

describe('ProtectedModule', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders children when role has access', () => {
    authService.setUserData({ role_names: ['Detective'] });

    render(
      <MemoryRouter>
        <ProtectedModule moduleId="detective-board">
          <div>visible-content</div>
        </ProtectedModule>
      </MemoryRouter>
    );

    expect(screen.getByText('visible-content')).toBeInTheDocument();
  });

  it('renders fallback when role has no access', () => {
    authService.setUserData({ role_names: ['Basic User'] });

    render(
      <MemoryRouter>
        <ProtectedModule moduleId="detective-board" fallback={<div>access-denied</div>}>
          <div>hidden-content</div>
        </ProtectedModule>
      </MemoryRouter>
    );

    expect(screen.getByText('access-denied')).toBeInTheDocument();
    expect(screen.queryByText('hidden-content')).not.toBeInTheDocument();
  });
});

