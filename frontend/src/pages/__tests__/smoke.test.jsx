import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthPage from '../AuthPage';
import DashboardPage from '../DashboardPage';

let mockAuthState;
const apiRequestMock = vi.fn();
const toggleThemeMock = vi.fn();
const logoutMock = vi.fn(async () => {});
const deleteCurrentUserMock = vi.fn(async () => true);
const resetPasswordMock = vi.fn(async () => {});

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

function buildDashboardApiMock({ consentAccepted, role = 'parent' }) {
  const state = {
    consentAccepted,
    acknowledgedScreeningOnly: consentAccepted,
    acknowledgedDataUse: consentAccepted,
    parent: {
      _id: role === 'admin' ? 'admin-parent' : 'parent-main',
      email: role === 'admin' ? 'admin@gmail.com' : 'main@example.com',
      displayName: role === 'admin' ? 'Admin User' : 'Main Parent',
      role,
      createdAt: '2026-04-01T00:00:00.000Z'
    },
    children: [
      {
        _id: 'child-1',
        nickname: 'Ari',
        dateOfBirth: '2024-04-01T00:00:00.000Z',
        ageInMonths: 24,
        sex: 'other'
      }
    ],
    logs: [
      {
        _id: 'log-1',
        completedAt: '2026-04-05T00:00:00.000Z',
        successLevel: 'completed',
        durationMinutes: 14,
        parentConfidence: 4,
        activityId: { _id: 'activity-1', title: 'Stack blocks', domain: 'motor' }
      }
    ],
    reports: [
      {
        _id: 'report-1',
        weekStart: '2026-04-01T00:00:00.000Z',
        status: 'needs_monitoring',
        summary: 'Summary text',
        reportDisclaimer: 'Screening only. Not a diagnosis.',
        predictionSource: 'ml',
        predictionConfidence: 0.82,
        modelVersion: 'sapna-ml-test',
        classProbabilities: {
          on_track: 0.14,
          needs_monitoring: 0.82,
          at_risk: 0.04
        },
        topRiskFactors: ['Language-focused activities appear below the expected range for this age.']
      }
    ],
    adminParent: {
      parent: {
        _id: 'parent-1',
        email: 'test1@gmail.com',
        displayName: 'Demo Parent',
        role: 'parent'
      },
      children: [{ _id: 'admin-child-1', nickname: 'Ari', ageInMonths: 24 }],
      logs: [],
      reports: [],
      consentHistory: []
    }
  };

  return async (path, { method = 'GET' } = {}) => {
    if (path === '/health') {
      return {
        ok: true,
        mlServiceReachable: true,
        mlModelVersion: 'sapna-ml-test',
        mlServiceEnabled: true
      };
    }
    if (path === '/auth/me' && method === 'GET') {
      return { parent: state.parent };
    }
    if (path === '/auth/me' && method === 'PATCH') {
      return { parent: { ...state.parent, displayName: 'Updated Parent' } };
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
    if (path === '/children/child-1' && method === 'PATCH') {
      state.children[0] = { ...state.children[0], nickname: 'Ari Updated' };
      return { child: state.children[0] };
    }
    if (path === '/children/child-1' && method === 'DELETE') {
      return { deleted: true, deletedAt: new Date().toISOString() };
    }
    if (path.startsWith('/activities')) {
      return {
        activities: [
          {
            _id: 'activity-1',
            title: 'Stack blocks',
            description: 'Practice stacking two safe blocks.',
            domain: 'motor',
            ageBandMinMonths: 24,
            ageBandMaxMonths: 29,
            estimatedMinutes: 10,
            instructions: ['Show the blocks.', 'Invite the child to stack.', 'Praise attempts.']
          }
        ]
      };
    }
    if (path.startsWith('/logs?')) {
      return { logs: state.logs };
    }
    if (path === '/logs' && method === 'POST') {
      return { log: { _id: 'log-new' } };
    }
    if (path === '/logs/log-1' && method === 'DELETE') {
      return { deleted: true, deletedAt: new Date().toISOString() };
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
          },
          successCounts: {
            needs_help: 0,
            partial: 1,
            completed: 1,
            mastered: 0
          }
        },
        latestReport: state.reports[0],
        medicalDisclaimer: 'Medical Disclaimer: Screening only. Not a diagnosis.'
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
        parent: state.parent,
        children: state.children
      };
    }
    if (path === '/privacy/account' && method === 'DELETE') {
      return {
        deleted: true,
        deletedAt: new Date().toISOString()
      };
    }
    if (path === '/admin/summary') {
      return {
        summary: {
          parents: 2,
          children: 4,
          logs: 20,
          reports: 6,
          consents: 2,
          recentLogs: 5,
          recentReports: 1,
          mlHealth: { mlServiceReachable: true }
        }
      };
    }
    if (path.startsWith('/admin/parents?')) {
      return {
        parents: [
          {
            _id: 'parent-1',
            email: 'test1@gmail.com',
            displayName: 'Demo Parent',
            role: 'parent',
            counts: { children: 3, logs: 48, reports: 12 }
          }
        ],
        pagination: { total: 1, page: 1, limit: 20, pages: 1 }
      };
    }
    if (path === '/admin/parents/parent-1' && method === 'GET') {
      return state.adminParent;
    }
    if (path === '/admin/parents/parent-1' && method === 'PATCH') {
      state.adminParent.parent.role = 'admin';
      return { parent: state.adminParent.parent };
    }
    if (path === '/admin/parents/parent-1/data' && method === 'DELETE') {
      return { deleted: true, deletedAt: new Date().toISOString() };
    }
    throw new Error(`Unhandled mock request: ${method} ${path}`);
  };
}

async function openTab(name) {
  await userEvent.click(await screen.findByRole('button', { name }));
}

describe('frontend smoke flows', () => {
  beforeEach(() => {
    mockAuthState = {
      user: { email: 'main@example.com', getIdToken: vi.fn(async () => 'token-main') },
      logout: logoutMock,
      deleteCurrentUser: deleteCurrentUserMock,
      resetPassword: resetPasswordMock,
      login: vi.fn(),
      signup: vi.fn(),
      configError: ''
    };
    apiRequestMock.mockReset();
    toggleThemeMock.mockReset();
    logoutMock.mockClear();
    deleteCurrentUserMock.mockClear();
    resetPasswordMock.mockClear();

    if (!URL.createObjectURL) {
      URL.createObjectURL = () => 'blob:test';
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = () => {};
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(window, 'prompt').mockReturnValue('DELETE LOG');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows medical disclaimer on onboarding', () => {
    render(<AuthPage />);
    expect(screen.getByText(/Medical Disclaimer:/i)).toBeInTheDocument();
  });

  it('renders tabs and hides admin for parent users', async () => {
    apiRequestMock.mockImplementation(buildDashboardApiMock({ consentAccepted: true }));
    render(<DashboardPage />);

    expect(await screen.findByRole('button', { name: /^Overview$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Children$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Activities$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reports$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Insights$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Profile$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Settings$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^About$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Admin$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Model Online/i)).toBeInTheDocument();
  });

  it('enforces consent acknowledgments before enabling log/report flow', async () => {
    apiRequestMock.mockImplementation(buildDashboardApiMock({ consentAccepted: false }));
    render(<DashboardPage />);

    await screen.findByText(/Parental Consent Required/i);
    await openTab(/^Children$/i);
    expect(screen.getByRole('button', { name: /Save Activity Log/i })).toBeDisabled();
    await openTab(/^Reports$/i);
    expect(screen.getByRole('button', { name: /Generate Weekly Report/i })).toBeDisabled();

    await openTab(/^Overview$/i);
    await userEvent.click(screen.getByRole('button', { name: /I Accept Consent Terms/i }));
    expect(
      await screen.findByText(/Please acknowledge both consent statements before continuing/i)
    ).toBeInTheDocument();
  });

  it('supports happy-path actions, profile, settings, and about content', async () => {
    apiRequestMock.mockImplementation(buildDashboardApiMock({ consentAccepted: true }));
    render(<DashboardPage />);

    const disclaimerMatches = await screen.findAllByText(/Medical Disclaimer:/i);
    expect(disclaimerMatches.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sapna-ml-test/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ML Screening/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Language-focused activities appear below the expected range for this age./i).length
    ).toBeGreaterThan(0);

    await openTab(/^Activities$/i);
    expect(await screen.findByText(/Guided Activity Library/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Plan This Activity/i }));

    await openTab(/^Children$/i);
    await userEvent.type(screen.getAllByLabelText(/Nickname/i)[0], 'Nia');
    await userEvent.type(screen.getAllByLabelText(/Date of Birth/i)[0], '2024-06-01');
    await userEvent.click(screen.getByRole('button', { name: /Save Child Profile/i }));

    await userEvent.clear(screen.getAllByLabelText(/Nickname/i)[1]);
    await userEvent.type(screen.getAllByLabelText(/Nickname/i)[1], 'Ari Updated');
    await userEvent.click(screen.getByRole('button', { name: /Update Child Profile/i }));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/children/child-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    await userEvent.clear(screen.getByLabelText(/Logged Duration \(minutes\)/i));
    await userEvent.type(screen.getByLabelText(/Logged Duration \(minutes\)/i), '15');
    await userEvent.click(screen.getByRole('button', { name: /Save Activity Log/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/logs/log-1',
        expect.objectContaining({ method: 'DELETE', body: { confirmationText: 'DELETE LOG' } })
      );
    });

    await openTab(/^Reports$/i);
    await userEvent.click(screen.getByRole('button', { name: /Generate Weekly Report/i }));

    await openTab(/^Insights$/i);
    expect(screen.getByText(/Readiness Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Quality Checklist/i)).toBeInTheDocument();

    await openTab(/^Profile$/i);
    await userEvent.clear(screen.getByLabelText(/Display Name/i));
    await userEvent.type(screen.getByLabelText(/Display Name/i), 'Updated Parent');
    await userEvent.click(screen.getByRole('button', { name: /Save Profile/i }));

    await openTab(/^Settings$/i);
    await userEvent.click(screen.getByRole('button', { name: /Send Reset Email/i }));
    expect(resetPasswordMock).toHaveBeenCalledWith('main@example.com');
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

    await openTab(/^About$/i);
    expect(screen.getByText(/Parent-mediated toddler monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/ML Methodology/i)).toBeInTheDocument();
  });

  it('shows admin tab and supports core admin management for admin users', async () => {
    apiRequestMock.mockImplementation(buildDashboardApiMock({ consentAccepted: true, role: 'admin' }));
    render(<DashboardPage />);

    await openTab(/^Admin$/i);
    expect(await screen.findByText(/System Management/i)).toBeInTheDocument();
    expect(screen.getByText(/1 parent accounts/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /test1@gmail.com/i }));
    expect(await screen.findByText(/Selected Parent/i)).toBeInTheDocument();
    const selectedPanel = screen.getByText(/Selected Parent/i).closest('.card');
    expect(within(selectedPanel).getByText(/test1@gmail.com/i)).toBeInTheDocument();

    await userEvent.selectOptions(within(selectedPanel).getByLabelText(/Role/i), 'admin');
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/admin/parents/parent-1',
        expect.objectContaining({ method: 'PATCH', body: { role: 'admin' } })
      );
    });

    await userEvent.type(screen.getByPlaceholderText(/DELETE USER DATA/i), 'DELETE USER DATA');
    await userEvent.click(screen.getByRole('button', { name: /Delete User App Data/i }));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/admin/parents/parent-1/data',
        expect.objectContaining({ method: 'DELETE', body: { confirmationText: 'DELETE USER DATA' } })
      );
    });
  });
});
