import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RewardVerification from './RewardVerification';
import { authService, rewardsApi } from '../services';

describe('RewardVerification page', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    authService.setUserData({ id: 1, username: 'officer', role_names: ['Police Officer'] });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <RewardVerification />
      </MemoryRouter>
    );

  it('validates national id and does not call API for invalid input', async () => {
    const user = userEvent.setup();
    const verifySpy = vi.spyOn(rewardsApi, 'verifyByCode');
    renderPage();

    await user.type(screen.getByLabelText('کد ملی گزارش‌دهنده'), '123');
    await user.type(screen.getByLabelText('کد رهگیری / شناسه یکتا'), 'ABC-1');
    await user.click(screen.getByRole('button', { name: 'استعلام پاداش' }));

    expect(
      await screen.findByText('کد ملی باید دقیقا ۱۰ رقم باشد.')
    ).toBeInTheDocument();
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('calls verify API and renders returned reward details', async () => {
    const user = userEvent.setup();
    const verifySpy = vi.spyOn(rewardsApi, 'verifyByCode').mockResolvedValue({
      report_id: 55,
      tracking_code: 'ABCD1234EFGH5678',
      reward_amount: 120000000,
      reporter: {
        id: 7,
        username: 'citizen1',
        first_name: 'Ali',
        last_name: 'Rezaei',
        national_id: '0012345678',
      },
    });

    renderPage();

    await user.type(screen.getByLabelText('کد ملی گزارش‌دهنده'), '0012345678');
    await user.type(screen.getByLabelText('کد رهگیری / شناسه یکتا'), 'abcd1234efgh5678');
    await user.click(screen.getByRole('button', { name: 'استعلام پاداش' }));

    expect(verifySpy).toHaveBeenCalledWith({
      national_id: '0012345678',
      tracking_code: 'ABCD1234EFGH5678',
    });
    expect(await screen.findByText('نتیجه استعلام')).toBeInTheDocument();
    expect(screen.getByText('#55')).toBeInTheDocument();
    expect(screen.getByText('ABCD1234EFGH5678')).toBeInTheDocument();
    expect(screen.getByText('Ali Rezaei')).toBeInTheDocument();
    expect(screen.getByText('۱۲۰٬۰۰۰٬۰۰۰ ریال')).toBeInTheDocument();
  });

  it('shows API error message when verify fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(rewardsApi, 'verifyByCode').mockRejectedValue({
      message: 'کد رهگیری معتبر نیست',
    });

    renderPage();

    await user.type(screen.getByLabelText('کد ملی گزارش‌دهنده'), '0012345678');
    await user.type(screen.getByLabelText('کد رهگیری / شناسه یکتا'), 'INVALID');
    await user.click(screen.getByRole('button', { name: 'استعلام پاداش' }));

    expect(await screen.findByText('کد رهگیری معتبر نیست')).toBeInTheDocument();
  });
});
