import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthPage from '../AuthPage';
import DashboardPage from '../DashboardPage';

let mockAuthState;
const apiRequestMock = vi.fn();
const toggleThemeMock = vi.fn();
const logoutMock = vi.fn(async () => {});
const deleteCurrentUserMock = vi.fn(async () => true);

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthState
}));

vi.mock('../../api/client', () => ({
  apiRequest: (...args) => apiRequestMock(...args)
}));

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: toggleThemeMock
  })
}));

function buildDashboardApiMock({ consentAccepted }) {
  const state = {
    consentAccepted,
    acknowledgedScreeningOnly: consentAccepted,
    acknowledgedDataUse: consentAccepted,
    children: [
      {
        _id: 'child-1',
        nickname: 'Ari',
        ageInMonths: 24
      }
    ],
    reports: [
      {
        _id: 'report-1',
        weekStart: '2026-04-01T00:00:00.000Z',
        status: 'needs_monitoring',
        summary: 'Summary text',
        reportDisclaimer: 'Screening only. Not a diagnosis.'
      }
    ]
  };

  return async (path, { method = 'GET' } = {}) => {
    if (path === '/auth/me') {
      return { parent: { email: 'main@example.com' } };
    }
    if (path === '/consent/status') {
      return {
        hasAcceptedConsent: state.consentAccepted,
        acknowledgedScreeningOnly: state.acknowledgedScreeningOnly,
        acknowledgedDataUse: state.acknowledgedDataUse,
        consentVersion: '1.0'
      };
    }
    if (path === '/consent' && method === 'POST') {
      state.consentAccepted = true;
      state.acknowledgedScreeningOnly = true;
      state.acknowledgedDataUse = true;
      return {
        hasAcceptedConsent: true,
        acknowledgedScreeningOnly: true,
        acknowledgedDataUse: true,
        consentVersion: '1.0'
      };
    }
    if (path === '/children' && method === 'GET') {
      return { children: state.children };
    }
    if (path === '/children' && method === 'POST') {
      return {
        child: {
          _id: 'child-new',
          nickname: 'Nia',
          ageInMonths: 20
        }
      };
    }
    if (path.startsWith('/activities')) {
      return {
        activities: [
          {
            _id: 'activity-1',
            title: 'Stack blocks',
            domain: 'motor'
          }
        ]
      };
    }
    if (path.startsWith('/logs?')) {
      return { logs: [] };
    }
    if (path === '/logs' && method === 'POST') {
      return { log: { _id: 'log-1' } };
    }
    if (path.startsWith('/dashboard/')) {
      return {
        stats: {
          logsLast30Days: 2,
          totalDurationMinutes: 25,
          domainTotals: {
            cognitive: 1,
            motor: 1,
            language: 0,
            social_emotional: 0
          }
        },
        latestReport: state.reports[0]
      };
    }
    if (path.startsWith('/reports?')) {
      return { reports: state.reports };
    }
    if (path === '/reports/generate-weekly' && method === 'POST') {
      return { report: { _id: 'report-new' } };
    }
    if (path === '/privacy/export') {
      return {
        exportedAt: new Date().toISOString(),
        parent: { email: 'main@example.com' },
        children: state.children
      };
    }
    if (path === '/privacy/account' && method === 'DELETE') {
      return {
        deleted: true,
        deletedAt: new Date().toISOString()
      };
    }
    throw new Error(`Unhandled mock request: ${method} ${path}`);
  };
}

describe('frontend smoke flows', () => {
  beforeEach(() => {
    mockAuthState = {
      user: { email: 'main@example.com', getIdToken: vi.fn(async () => 'token-main') },
      logout: logoutMock,
      deleteCurrentUser: deleteCurrentUserMock,
      login: vi.fn(),
      signup: vi.fn(),
      configError: ''
    };
    apiRequestMock.mockReset();
    toggleThemeMock.mockReset();
    logoutMock.mockClear();
    deleteCurrentUserMock.mockClear();

    if (!URL.createObjectURL) {
      URL.createObjectURL = () => 'blob:test';
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => {};
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows medical disclaimer on onboarding', () => {
    render(<AuthPage />);
    expect(screen.getByText(/Medical Disclaimer:/i)).toBeInTheDocument();
  });

  it('enforces consent acknowledgments before enabling log/report flow', async () => {
    apiRequestMock.mockImplementation(buildDashboardApiMock({ consentAccepted: false }));
    render(<DashboardPage />);

    await screen.findByText(/Parental Consent Required/i);
    expect(screen.getByRole('button', { name: /Save Activity Log/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Generate Weekly Report/i })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /I Accept Consent Terms/i }));
    expect(
      await screen.findByText(/Please acknowledge both consent statements before continuing/i)
    ).toBeInTheDocument();
  });

  it('supports happy-path actions and privacy tools', async () => {
    apiRequestMock.mockImplementation(buildDashboardApiMock({ consentAccepted: true }));
    render(<DashboardPage />);

    const disclaimerMatches = await screen.findAllByText(/Medical Disclaimer:/i);
    expect(disclaimerMatches.length).toBeGreaterThan(0);
    expect(screen.getByText(/Screening only. Not a diagnosis./i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Nickname/i), 'Nia');
    await userEvent.type(screen.getByLabelText(/Date of Birth/i), '2024-06-01');
    await userEvent.click(screen.getByRole('button', { name: /Save Child Profile/i }));

    await userEvent.clear(screen.getByLabelText(/Duration \(minutes\)/i));
    await userEvent.type(screen.getByLabelText(/Duration \(minutes\)/i), '15');
    await userEvent.click(screen.getByRole('button', { name: /Save Activity Log/i }));

    await userEvent.click(screen.getByRole('button', { name: /Generate Weekly Report/i }));
    await userEvent.click(screen.getByRole('button', { name: /Export My Data/i }));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/privacy/export',
        expect.objectContaining({ token: 'token-main' })
      );
    });

    const deleteBtn = screen.getByRole('button', { name: /Delete My Account\/Data/i });
    expect(deleteBtn).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(/DELETE MY DATA/i), 'DELETE MY DATA');
    expect(deleteBtn).toBeEnabled();
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/privacy/account',
        expect.objectContaining({
          method: 'DELETE',
          body: { confirmationText: 'DELETE MY DATA' },
          token: 'token-main'
        })
      );
    });

    expect(deleteCurrentUserMock).toHaveBeenCalled();
    expect(logoutMock).toHaveBeenCalled();
  });
});
