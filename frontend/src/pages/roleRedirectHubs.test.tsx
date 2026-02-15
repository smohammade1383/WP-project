import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import Cases from './Cases';
import Complaints from './Complaints';
import Evidence from './Evidence';
import Finance from './Finance';
import Rewards from './Rewards';
import Trials from './Trials';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store';

const renderHub = (element: ReactElement) => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={element} />
        <Route path="/auth" element={<div>route-auth</div>} />
        <Route path="/403" element={<div>route-403</div>} />
        <Route path="/detective/cases" element={<div>route-detective-cases</div>} />
        <Route path="/cadet/complaints" element={<div>route-cadet-complaints</div>} />
        <Route path="/coroner/lab" element={<div>route-coroner-lab</div>} />
        <Route path="/legal-bail" element={<div>route-legal-bail</div>} />
        <Route path="/detective/rewards" element={<div>route-detective-rewards</div>} />
        <Route
          path="/finance/reward-verification"
          element={<div>route-reward-verification</div>}
        />
        <Route path="/judge/bench" element={<div>route-judge-bench</div>} />
        <Route path="/sergeant/operations" element={<div>route-sergeant-operations</div>} />
        <Route path="/admin" element={<div>route-admin</div>} />
        <Route path="/officer/tips" element={<div>route-officer-tips</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Role redirect hubs', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false, error: null, isLoading: false });
  });

  it('redirects unauthenticated users to /auth', () => {
    renderHub(<Cases />);
    expect(screen.getByText('route-auth')).toBeInTheDocument();
  });

  it('redirects detective from /cases to detective queue', () => {
    authService.setUserData({ id: 1, username: 'detective', role_names: ['Detective'] });
    renderHub(<Cases />);
    expect(screen.getByText('route-detective-cases')).toBeInTheDocument();
  });

  it('accepts Sergent alias and routes to sergeant operations', () => {
    authService.setUserData({ id: 2, username: 'serg', role_names: ['Sergent'] });
    renderHub(<Cases />);
    expect(screen.getByText('route-sergeant-operations')).toBeInTheDocument();
  });

  it('redirects cadet from /complaints to cadet inbox', () => {
    authService.setUserData({ id: 3, username: 'cadet', role_names: ['Cadet'] });
    renderHub(<Complaints />);
    expect(screen.getByText('route-cadet-complaints')).toBeInTheDocument();
  });

  it('redirects coroner from /evidence to lab', () => {
    authService.setUserData({ id: 4, username: 'coroner', role_names: ['Coroner'] });
    renderHub(<Evidence />);
    expect(screen.getByText('route-coroner-lab')).toBeInTheDocument();
  });

  it('redirects citizen from /finance to legal bail module', () => {
    authService.setUserData({ id: 5, username: 'citizen', role_names: ['Basic User'] });
    renderHub(<Finance />);
    expect(screen.getByText('route-legal-bail')).toBeInTheDocument();
  });

  it('redirects detective from /rewards to detective reward review', () => {
    authService.setUserData({ id: 6, username: 'detective', role_names: ['Detective'] });
    renderHub(<Rewards />);
    expect(screen.getByText('route-detective-rewards')).toBeInTheDocument();
  });

  it('redirects cadet from /rewards to reward verification', () => {
    authService.setUserData({ id: 10, username: 'cadet', role_names: ['Cadet'] });
    renderHub(<Rewards />);
    expect(screen.getByText('route-reward-verification')).toBeInTheDocument();
  });

  it('redirects officer from /rewards to officer tips inbox', () => {
    authService.setUserData({ id: 11, username: 'officer', role_names: ['Police Officer'] });
    renderHub(<Rewards />);
    expect(screen.getByText('route-officer-tips')).toBeInTheDocument();
  });

  it('redirects judge from /trials to judge bench', () => {
    authService.setUserData({ id: 7, username: 'judge', role_names: ['Judge'] });
    renderHub(<Trials />);
    expect(screen.getByText('route-judge-bench')).toBeInTheDocument();
  });

  it('redirects unauthorized custom role to /403', () => {
    authService.setUserData({ id: 8, username: 'viewer', role_names: ['Viewer'] });
    renderHub(<Trials />);
    expect(screen.getByText('route-403')).toBeInTheDocument();
  });

  it('redirects administrator to admin route where applicable', () => {
    authService.setUserData({ id: 9, username: 'admin', role_names: ['Administrator'] });
    renderHub(<Rewards />);
    expect(screen.getByText('route-admin')).toBeInTheDocument();
  });
});
