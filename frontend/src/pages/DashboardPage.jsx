import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

const successOptions = [
  { value: 'needs_help', label: 'Needs Help' },
  { value: 'partial', label: 'Partial Success' },
  { value: 'completed', label: 'Completed' },
  { value: 'mastered', label: 'Mastered' }
];

const statusLabels = {
  on_track: 'On Track',
  needs_monitoring: 'Needs Monitoring',
  at_risk: 'At Risk'
};

const predictionSourceLabels = {
  ml: 'ML Screening',
  rules_fallback: 'Rules Fallback'
};

const domainLabels = {
  cognitive: 'Cognitive',
  motor: 'Motor',
  language: 'Language',
  social_emotional: 'Social-emotional'
};

const baseTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'children', label: 'Children' },
  { id: 'activities', label: 'Activities' },
  { id: 'reports', label: 'Reports' },
  { id: 'insights', label: 'Insights' },
  { id: 'profile', label: 'Profile' },
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' }
];

function formatConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'N/A';
  }
  return `${Math.round(numeric * 100)}%`;
}

function formatDate(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString();
}

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const { user, logout, deleteCurrentUser, resetPassword } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('overview');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ displayName: '' });
  const [consent, setConsent] = useState(null);
  const [consentForm, setConsentForm] = useState({
    acknowledgedScreeningOnly: false,
    acknowledgedDataUse: false
  });
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState([]);
  const [mlHealth, setMlHealth] = useState(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [activityDomainFilter, setActivityDomainFilter] = useState('all');
  const [childDeleteConfirmation, setChildDeleteConfirmation] = useState('');

  const [adminSummary, setAdminSummary] = useState(null);
  const [adminParents, setAdminParents] = useState([]);
  const [adminPagination, setAdminPagination] = useState(null);
  const [adminSelectedParent, setAdminSelectedParent] = useState(null);
  const [adminQuery, setAdminQuery] = useState('');
  const [adminConfirmation, setAdminConfirmation] = useState('');

  const [childForm, setChildForm] = useState({ nickname: '', dateOfBirth: '', sex: '' });
  const [childEditForm, setChildEditForm] = useState({ nickname: '', dateOfBirth: '', sex: '' });
  const [logForm, setLogForm] = useState({
    activityId: '',
    durationMinutes: 10,
    successLevel: 'completed',
    parentConfidence: 3,
    notes: ''
  });

  const isAdmin = profile?.role === 'admin';
  const tabs = isAdmin ? [...baseTabs, { id: 'admin', label: 'Admin' }] : baseTabs;
  const selectedChild = useMemo(
    () => children.find((item) => item._id === selectedChildId) || null,
    [children, selectedChildId]
  );
  const requiresConsent =
    !consent?.hasAcceptedConsent ||
    !consent?.acknowledgedScreeningOnly ||
    !consent?.acknowledgedDataUse;
  const filteredActivities = useMemo(() => {
    if (activityDomainFilter === 'all') return activities;
    return activities.filter((activity) => activity.domain === activityDomainFilter);
  }, [activities, activityDomainFilter]);
  const strongestDomain = useMemo(() => {
    const totals = dashboard?.stats?.domainTotals || {};
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || null;
  }, [dashboard]);
  const focusDomain = useMemo(() => {
    const totals = dashboard?.stats?.domainTotals || {};
    return Object.entries(totals).sort((a, b) => a[1] - b[1])[0] || null;
  }, [dashboard]);
  const successTotal = useMemo(() => {
    const counts = dashboard?.stats?.successCounts || {};
    return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  }, [dashboard]);
  const masteryRate = useMemo(() => {
    if (!successTotal) return 0;
    const counts = dashboard?.stats?.successCounts || {};
    return Math.round((((counts.completed || 0) + (counts.mastered || 0)) / successTotal) * 100);
  }, [dashboard, successTotal]);
  const readinessScore = useMemo(() => {
    const logScore = Math.min((dashboard?.stats?.logsLast30Days || 0) * 5, 40);
    const domainCoverage =
      Object.values(dashboard?.stats?.domainTotals || {}).filter((value) => Number(value) > 0).length * 10;
    const reportScore = dashboard?.latestReport ? 20 : 0;
    return Math.min(100, Math.round(logScore + domainCoverage + reportScore));
  }, [dashboard]);

  async function getToken() {
    return user.getIdToken();
  }

  async function callApi(path, options = {}) {
    const token = await getToken();
    return apiRequest(path, { ...options, token });
  }

  async function loadMlHealth() {
    try {
      const healthData = await apiRequest('/health');
      setMlHealth(healthData);
    } catch {
      setMlHealth({ mlServiceReachable: false, mlModelVersion: null, mlServiceEnabled: false });
    }
  }

  async function loadBaseData() {
    setError('');
    setActionMessage('');
    setPending(true);
    try {
      const [profileData, consentData, childrenData] = await Promise.all([
        callApi('/auth/me'),
        callApi('/consent/status'),
        callApi('/children')
      ]);

      setProfile(profileData.parent);
      setProfileForm({ displayName: profileData.parent?.displayName || '' });
      setConsent(consentData);
      setConsentForm({
        acknowledgedScreeningOnly: Boolean(consentData.acknowledgedScreeningOnly),
        acknowledgedDataUse: Boolean(consentData.acknowledgedDataUse)
      });
      setChildren(childrenData.children || []);

      if (!selectedChildId && childrenData.children?.length > 0) {
        setSelectedChildId(childrenData.children[0]._id);
      }
    } catch (baseError) {
      setError(baseError.message);
    } finally {
      setPending(false);
    }
  }

  async function loadChildData(childId) {
    if (!childId) {
      setActivities([]);
      setLogs([]);
      setDashboard(null);
      setReports([]);
      return;
    }

    setError('');
    setActionMessage('');
    try {
      const [activityData, logData, dashboardData, reportData] = await Promise.all([
        callApi(`/activities?childId=${childId}`),
        callApi(`/logs?childId=${childId}&limit=50`),
        callApi(`/dashboard/${childId}`),
        callApi(`/reports?childId=${childId}`)
      ]);

      setActivities(activityData.activities || []);
      setLogs(logData.logs || []);
      setDashboard(dashboardData);
      setReports(reportData.reports || []);

      if (!logForm.activityId && activityData.activities?.length > 0) {
        setLogForm((prev) => ({ ...prev, activityId: activityData.activities[0]._id }));
      }
    } catch (childError) {
      setError(childError.message);
    }
  }

  async function loadAdminData(query = adminQuery) {
    if (!isAdmin) return;
    try {
      const [summaryData, parentData] = await Promise.all([
        callApi('/admin/summary'),
        callApi(`/admin/parents?query=${encodeURIComponent(query)}&limit=20&page=1`)
      ]);
      setAdminSummary(summaryData.summary);
      setAdminParents(parentData.parents || []);
      setAdminPagination(parentData.pagination || null);
    } catch (adminError) {
      setError(adminError.message);
    }
  }

  async function loadAdminParent(parentId) {
    try {
      const parentData = await callApi(`/admin/parents/${parentId}`);
      setAdminSelectedParent(parentData);
      setAdminConfirmation('');
    } catch (adminError) {
      setError(adminError.message);
    }
  }

  useEffect(() => {
    loadMlHealth();
    loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadChildData(selectedChildId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  useEffect(() => {
    if (!selectedChild) {
      setChildEditForm({ nickname: '', dateOfBirth: '', sex: '' });
      setChildDeleteConfirmation('');
      return;
    }

    setChildEditForm({
      nickname: selectedChild.nickname || '',
      dateOfBirth: formatDateInput(selectedChild.dateOfBirth),
      sex: selectedChild.sex || ''
    });
    setChildDeleteConfirmation('');
  }, [selectedChild]);

  useEffect(() => {
    if (isAdmin && activeTab === 'admin') {
      loadAdminData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, activeTab]);

  async function handleConsentAccept() {
    if (!consentForm.acknowledgedScreeningOnly || !consentForm.acknowledgedDataUse) {
      setError('Please acknowledge both consent statements before continuing.');
      return;
    }

    setPending(true);
    setError('');
    setActionMessage('');
    try {
      const consentData = await callApi('/consent', {
        method: 'POST',
        body: { acknowledgedScreeningOnly: true, acknowledgedDataUse: true }
      });
      setConsent(consentData);
      setActionMessage('Consent saved successfully.');
      await loadBaseData();
    } catch (consentError) {
      setError(consentError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleProfileUpdate(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    setActionMessage('');
    try {
      const profileData = await callApi('/auth/me', {
        method: 'PATCH',
        body: { displayName: profileForm.displayName }
      });
      setProfile(profileData.parent);
      setActionMessage('Profile updated.');
    } catch (profileError) {
      setError(profileError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleCreateChild(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await callApi('/children', { method: 'POST', body: childForm });
      setChildForm({ nickname: '', dateOfBirth: '', sex: '' });
      await loadBaseData();
      setActionMessage('Child profile saved.');
    } catch (childError) {
      setError(childError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleUpdateChild(event) {
    event.preventDefault();
    if (!selectedChildId) {
      setError('Select a child profile first.');
      return;
    }

    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await callApi(`/children/${selectedChildId}`, { method: 'PATCH', body: childEditForm });
      await loadBaseData();
      await loadChildData(selectedChildId);
      setActionMessage('Child profile updated.');
    } catch (childError) {
      setError(childError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteChild() {
    if (!selectedChildId) {
      setError('Select a child profile first.');
      return;
    }

    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await callApi(`/children/${selectedChildId}`, {
        method: 'DELETE',
        body: { confirmationText: childDeleteConfirmation }
      });
      const remainingChildren = children.filter((child) => child._id !== selectedChildId);
      setSelectedChildId(remainingChildren[0]?._id || '');
      setChildDeleteConfirmation('');
      await loadBaseData();
      setActionMessage('Child profile and related app data deleted.');
    } catch (childError) {
      setError(childError.message);
    } finally {
      setPending(false);
    }
  }

  function handlePlanActivity(activity) {
    setLogForm((prev) => ({ ...prev, activityId: activity._id, durationMinutes: activity.estimatedMinutes || prev.durationMinutes }));
    setActiveTab('children');
    setActionMessage(`Activity "${activity.title}" selected for the next log.`);
  }

  async function handleCreateLog(event) {
    event.preventDefault();
    if (!selectedChildId) {
      setError('Create or select a child profile first.');
      return;
    }

    setPending(true);
    setError('');
    setActionMessage('');

    try {
      await callApi('/logs', {
        method: 'POST',
        body: {
          childId: selectedChildId,
          activityId: logForm.activityId,
          durationMinutes: Number(logForm.durationMinutes),
          successLevel: logForm.successLevel,
          parentConfidence: Number(logForm.parentConfidence),
          notes: logForm.notes
        }
      });
      setLogForm((prev) => ({ ...prev, notes: '' }));
      setActionMessage('Activity log saved.');
      await loadChildData(selectedChildId);
    } catch (logError) {
      setError(logError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteLog(logId) {
    const typed = window.prompt('Type DELETE LOG to remove this activity log.');
    if (typed !== 'DELETE LOG') {
      setError('Confirmation text mismatch. Enter exactly: DELETE LOG');
      return;
    }

    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await callApi(`/logs/${logId}`, { method: 'DELETE', body: { confirmationText: 'DELETE LOG' } });
      await loadChildData(selectedChildId);
      setActionMessage('Activity log deleted.');
    } catch (logError) {
      setError(logError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleGenerateReport() {
    if (!selectedChildId) {
      setError('Select a child profile to generate a report.');
      return;
    }

    setPending(true);
    setError('');
    setActionMessage('');

    try {
      await callApi('/reports/generate-weekly', {
        method: 'POST',
        body: { childId: selectedChildId }
      });
      setActionMessage('Weekly report generated.');
      await loadChildData(selectedChildId);
    } catch (reportError) {
      setError(reportError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleExportData() {
    setPending(true);
    setError('');
    setActionMessage('');
    try {
      const exportPayload = await callApi('/privacy/export');
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sapna-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setActionMessage('Data export downloaded as JSON.');
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteAccount() {
    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await callApi('/privacy/account', {
        method: 'DELETE',
        body: { confirmationText: deleteConfirmationText }
      });

      try {
        await deleteCurrentUser();
      } catch (firebaseDeleteError) {
        console.warn('Firebase account deletion could not be completed from browser session.', firebaseDeleteError);
      }

      await logout();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setPending(false);
    }
  }

  async function handlePasswordReset() {
    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await resetPassword(profile?.email || user?.email);
      setActionMessage('Password reset email sent.');
    } catch (passwordError) {
      setError(passwordError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleAdminSearch(event) {
    event.preventDefault();
    await loadAdminData(adminQuery);
  }

  async function handleAdminParentUpdate(parentId, updates) {
    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await callApi(`/admin/parents/${parentId}`, { method: 'PATCH', body: updates });
      await loadAdminData();
      await loadAdminParent(parentId);
      setActionMessage('Admin user update saved.');
    } catch (adminError) {
      setError(adminError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleAdminDeleteUserData(parentId) {
    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await callApi(`/admin/parents/${parentId}/data`, {
        method: 'DELETE',
        body: { confirmationText: adminConfirmation }
      });
      setAdminSelectedParent(null);
      setAdminConfirmation('');
      await loadAdminData();
      setActionMessage('Selected user app data deleted.');
    } catch (adminError) {
      setError(adminError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleAdminDeleteResource(path, confirmationText) {
    const typed = window.prompt(`Type ${confirmationText} to confirm this destructive action.`);
    if (typed !== confirmationText) {
      setError(`Confirmation text mismatch. Enter exactly: ${confirmationText}`);
      return;
    }

    setPending(true);
    setError('');
    setActionMessage('');
    try {
      await callApi(path, { method: 'DELETE', body: { confirmationText } });
      if (adminSelectedParent?.parent?._id) {
        await loadAdminParent(adminSelectedParent.parent._id);
      }
      await loadAdminData();
      setActionMessage('Admin deletion completed.');
    } catch (adminError) {
      setError(adminError.message);
    } finally {
      setPending(false);
    }
  }

  function renderMlStatusCard() {
    return (
      <section className="card ml-status-card">
        <div>
          <p className="eyebrow">ML Screening Engine</p>
          <h2>{mlHealth?.mlServiceReachable ? 'Model Online' : 'Rules Fallback Active'}</h2>
          <p>
            Weekly reports use the deployed ML model when confidence is high enough, then fall back
            to the transparent rules engine when needed.
          </p>
        </div>
        <div className="ml-status-pill-wrap">
          <span
            className={`ml-status-pill ${
              mlHealth?.mlServiceReachable ? 'ml-status-online' : 'ml-status-fallback'
            }`}
          >
            {mlHealth?.mlServiceReachable ? 'ML Online' : 'Fallback Ready'}
          </span>
          <span className="ml-version-text">
            {mlHealth?.mlModelVersion || 'Model version checking...'}
          </span>
        </div>
      </section>
    );
  }

  function renderReportCard(report, { compact = false } = {}) {
    const probabilityEntries = Object.entries(report.classProbabilities || {});
    const disclaimerText = report.reportDisclaimer || dashboard?.medicalDisclaimer;

    return (
      <div className="report-item" key={report._id}>
        <div className="report-header-row">
          <p>
            <strong>{formatDate(report.weekStart)}</strong> - {statusLabels[report.status] || report.status}
          </p>
          <span className={`source-badge source-${report.predictionSource || 'rules_fallback'}`}>
            {predictionSourceLabels[report.predictionSource] || 'Rules Fallback'}
          </span>
        </div>
        <p>{report.summary}</p>
        <div className="report-meta-grid">
          <div>
            <span className="report-meta-label">Confidence</span>
            <strong>{formatConfidence(report.predictionConfidence)}</strong>
          </div>
          <div>
            <span className="report-meta-label">Model</span>
            <strong>{report.modelVersion || 'sapna-rules-v1'}</strong>
          </div>
        </div>
        {report.predictionSource === 'rules_fallback' && (
          <p className="report-note">
            This report used the rules fallback because the ML service was unavailable or below the confidence threshold.
          </p>
        )}
        {probabilityEntries.length > 0 && (
          <div className="probability-grid">
            {probabilityEntries.map(([label, value]) => (
              <div className="probability-item" key={label}>
                <span>{statusLabels[label] || label}</span>
                <strong>{formatConfidence(value)}</strong>
              </div>
            ))}
          </div>
        )}
        {report.topRiskFactors?.length > 0 && (
          <div className="risk-factor-list">
            <h4>{report.status === 'on_track' ? 'Positive Signals' : 'Top Risk Factors'}</h4>
            <ul>
              {report.topRiskFactors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
          </div>
        )}
        {!compact && disclaimerText && <p className="report-disclaimer">{disclaimerText}</p>}
      </div>
    );
  }

  function renderConsentCard() {
    if (!requiresConsent) return null;
    return (
      <section className="card consent-card">
        <h2>Parental Consent Required</h2>
        <p>
          Before storing any developmental logs, please confirm consent for parent-reported data collection and secure processing.
        </p>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={consentForm.acknowledgedScreeningOnly}
            onChange={(event) =>
              setConsentForm((prev) => ({ ...prev, acknowledgedScreeningOnly: event.target.checked }))
            }
          />
          I understand this is a screening and monitoring aid, not a medical diagnosis.
        </label>
        <label className="consent-check">
          <input
            type="checkbox"
            checked={consentForm.acknowledgedDataUse}
            onChange={(event) =>
              setConsentForm((prev) => ({ ...prev, acknowledgedDataUse: event.target.checked }))
            }
          />
          I consent to secure storage and processing of parent-reported interaction data.
        </label>
        <button className="primary-btn" type="button" disabled={pending} onClick={handleConsentAccept}>
          I Accept Consent Terms
        </button>
      </section>
    );
  }

  function renderOverviewTab() {
    return (
      <div className="tab-panel">
        <section className="card disclaimer-card">
          <strong>Medical Disclaimer:</strong>{' '}
          {dashboard?.medicalDisclaimer ||
            'This tool supports developmental screening and monitoring only. It does not provide a medical diagnosis.'}
        </section>
        {renderMlStatusCard()}
        {renderConsentCard()}
        <section className="card quick-actions-card">
          <div>
            <p className="eyebrow">Today&apos;s Workspace</p>
            <h2>Keep the workflow focused</h2>
            <p>Jump directly into the task you need instead of scrolling through the whole product.</p>
          </div>
          <div className="quick-actions">
            <button className="secondary-btn" type="button" onClick={() => setActiveTab('activities')}>
              Browse Activities
            </button>
            <button className="secondary-btn" type="button" onClick={() => setActiveTab('children')}>
              Log Activity
            </button>
            <button className="secondary-btn" type="button" onClick={() => setActiveTab('reports')}>
              Generate Report
            </button>
            <button className="secondary-btn" type="button" onClick={() => setActiveTab('insights')}>
              View Insights
            </button>
          </div>
        </section>
        <section className="grid two-col">
          <article className="card">
            <p className="eyebrow">Selected Child</p>
            <h2>{selectedChild ? selectedChild.nickname : 'No child selected'}</h2>
            {selectedChild ? (
              <>
                <div className="stats-grid">
                  <div className="stat-box">
                    <span>Age</span>
                    <strong>{selectedChild.ageInMonths}m</strong>
                  </div>
                  <div className="stat-box">
                    <span>Reports</span>
                    <strong>{reports.length}</strong>
                  </div>
                </div>
                {selectedChild.ageWarning && <p className="warning-text">{selectedChild.ageWarning}</p>}
              </>
            ) : (
              <p>Create a child profile in the Children tab to begin.</p>
            )}
          </article>
          <article className="card">
            <p className="eyebrow">Last 30 Days</p>
            <h2>Progress Snapshot</h2>
            {!dashboard && <p>Select a child profile to view dashboard stats.</p>}
            {dashboard && (
              <>
                <div className="stats-grid">
                  <div className="stat-box">
                    <span>Logs</span>
                    <strong>{dashboard.stats.logsLast30Days}</strong>
                  </div>
                  <div className="stat-box">
                    <span>Interaction Minutes</span>
                    <strong>{dashboard.stats.totalDurationMinutes}</strong>
                  </div>
                </div>
                <div className="domain-bars compact-domain-bars">
                  {Object.entries(dashboard.stats.domainTotals).map(([domain, value]) => (
                    <div key={domain}>
                      <div className="domain-row">
                        <span>{domain.replace('_', ' ')}</span>
                        <span>{value}</span>
                      </div>
                      <progress max="20" value={Math.min(value, 20)} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>
        </section>
        <section className="grid two-col">
          <article className="card">
            <h2>Latest Weekly Summary</h2>
            {dashboard?.latestReport ? renderReportCard(dashboard.latestReport, { compact: true }) : <p>No weekly report yet.</p>}
          </article>
          <article className="card">
            <h2>Recent Logs</h2>
            {logs.length === 0 && <p>No logs yet for this child.</p>}
            {logs.slice(0, 5).map((log) => (
              <div className="mini-list-item" key={log._id}>
                <strong>{log.activityId?.title || 'Unknown activity'}</strong>
                <span>
                  {formatDate(log.completedAt)} - {log.successLevel.replace('_', ' ')} - {log.durationMinutes} min
                </span>
              </div>
            ))}
          </article>
        </section>
      </div>
    );
  }

  function renderChildrenTab() {
    return (
      <div className="tab-panel grid two-col">
        <article className="card">
          <h2>Create Child Profile</h2>
          <form className="form-grid" onSubmit={handleCreateChild}>
            <label>
              Nickname
              <input
                value={childForm.nickname}
                onChange={(event) => setChildForm((prev) => ({ ...prev, nickname: event.target.value }))}
                required
              />
            </label>
            <label>
              Date of Birth
              <input
                type="date"
                value={childForm.dateOfBirth}
                onChange={(event) => setChildForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))}
                required
              />
            </label>
            <label>
              Sex (Optional)
              <select
                value={childForm.sex}
                onChange={(event) => setChildForm((prev) => ({ ...prev, sex: event.target.value }))}
              >
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button className="primary-btn" type="submit" disabled={pending}>
              Save Child Profile
            </button>
          </form>

          <div className="child-list">
            <h3>Child Profiles</h3>
            {children.length === 0 && <p>No child profiles yet.</p>}
            {children.map((child) => (
              <button
                key={child._id}
                type="button"
                className={`chip ${selectedChildId === child._id ? 'chip-active' : ''}`}
                onClick={() => setSelectedChildId(child._id)}
              >
                {child.nickname} ({child.ageInMonths}m)
              </button>
            ))}
          </div>
          {selectedChild?.ageWarning && <p className="warning-text">{selectedChild.ageWarning}</p>}
        </article>

        <article className="card">
          <h2>Manage Selected Child</h2>
          {!selectedChild && <p>Select or create a child profile to edit details.</p>}
          {selectedChild && (
            <>
              <form className="form-grid" onSubmit={handleUpdateChild}>
                <label>
                  Nickname
                  <input
                    value={childEditForm.nickname}
                    onChange={(event) => setChildEditForm((prev) => ({ ...prev, nickname: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Date of Birth
                  <input
                    type="date"
                    value={childEditForm.dateOfBirth}
                    onChange={(event) => setChildEditForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Sex (Optional)
                  <select
                    value={childEditForm.sex}
                    onChange={(event) => setChildEditForm((prev) => ({ ...prev, sex: event.target.value }))}
                  >
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <button className="primary-btn" type="submit" disabled={pending}>
                  Update Child Profile
                </button>
              </form>
              <div className="danger-zone">
                <label>
                  Type <strong>DELETE CHILD DATA</strong> to remove this child&apos;s profile, logs, and reports
                  <input
                    value={childDeleteConfirmation}
                    onChange={(event) => setChildDeleteConfirmation(event.target.value)}
                    placeholder="DELETE CHILD DATA"
                  />
                </label>
                <button
                  className="danger-btn"
                  type="button"
                  onClick={handleDeleteChild}
                  disabled={pending || childDeleteConfirmation !== 'DELETE CHILD DATA'}
                >
                  Delete Child Data
                </button>
              </div>
            </>
          )}
        </article>

        <article className="card">
          <h2>Log Offline Activity</h2>
          {renderConsentCard()}
          <form className="form-grid" onSubmit={handleCreateLog}>
            <label>
              Activity
              <select
                value={logForm.activityId}
                onChange={(event) => setLogForm((prev) => ({ ...prev, activityId: event.target.value }))}
                required
              >
                <option value="">Select activity</option>
                {activities.map((activity) => (
                  <option key={activity._id} value={activity._id}>
                    {activity.title} ({activity.domain})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Logged Duration (minutes)
              <input
                type="number"
                min="1"
                max="240"
                value={logForm.durationMinutes}
                onChange={(event) => setLogForm((prev) => ({ ...prev, durationMinutes: event.target.value }))}
                required
              />
            </label>
            <label>
              Success Level
              <select
                value={logForm.successLevel}
                onChange={(event) => setLogForm((prev) => ({ ...prev, successLevel: event.target.value }))}
                required
              >
                {successOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Parent Confidence (1-5)
              <input
                type="number"
                min="1"
                max="5"
                value={logForm.parentConfidence}
                onChange={(event) => setLogForm((prev) => ({ ...prev, parentConfidence: event.target.value }))}
                required
              />
            </label>
            <label>
              Behavior Notes (optional)
              <textarea
                rows="3"
                value={logForm.notes}
                onChange={(event) => setLogForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
            <button className="primary-btn" type="submit" disabled={pending || requiresConsent || !selectedChildId}>
              Save Activity Log
            </button>
          </form>
        </article>

        <article className="card wide-card">
          <h2>Recent Logs</h2>
          {logs.length === 0 && <p>No logs yet for this child.</p>}
          {logs.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Activity</th>
                    <th>Domain</th>
                    <th>Success</th>
                    <th>Minutes</th>
                    <th>Confidence</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id}>
                      <td>{formatDate(log.completedAt)}</td>
                      <td>{log.activityId?.title || 'Unknown'}</td>
                      <td>{log.activityId?.domain || '-'}</td>
                      <td>{log.successLevel.replace('_', ' ')}</td>
                      <td>{log.durationMinutes}</td>
                      <td>{log.parentConfidence}</td>
                      <td>
                        <button className="danger-link" type="button" onClick={() => handleDeleteLog(log._id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>
    );
  }

  function renderActivitiesTab() {
    return (
      <div className="tab-panel">
        <section className="card report-action-card">
          <div>
            <p className="eyebrow">Guided Activity Library</p>
            <h2>{selectedChild ? `Activities for ${selectedChild.nickname}` : 'Select a child to personalize activities'}</h2>
            <p>
              Activities are filtered to the child&apos;s age band and stay offline-first so parents guide the interaction.
            </p>
          </div>
          <label className="compact-filter">
            Domain
            <select value={activityDomainFilter} onChange={(event) => setActivityDomainFilter(event.target.value)}>
              <option value="all">All domains</option>
              {Object.entries(domainLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="activity-card-grid">
          {!selectedChild && (
            <article className="card">
              <h2>No child selected</h2>
              <p>Create or select a child in the Children tab to see age-appropriate activities.</p>
            </article>
          )}
          {selectedChild && filteredActivities.length === 0 && (
            <article className="card">
              <h2>No matching activities</h2>
              <p>Try another domain filter or check that seeded activities are available.</p>
            </article>
          )}
          {selectedChild &&
            filteredActivities.map((activity) => (
              <article className="card activity-card" key={activity._id}>
                <div className="report-header-row">
                  <span className="source-badge source-ml">{domainLabels[activity.domain] || activity.domain}</span>
                  <span className="ml-version-text">{activity.ageBandMinMonths}-{activity.ageBandMaxMonths} months</span>
                </div>
                <h2>{activity.title}</h2>
                <p>{activity.description}</p>
                <div className="activity-meta-row">
                  <span>{activity.estimatedMinutes} min</span>
                  <span>{activity.instructions?.length || 0} steps</span>
                </div>
                {activity.instructions?.length > 0 && (
                  <ol className="instruction-list">
                    {activity.instructions.map((instruction) => (
                      <li key={instruction}>{instruction}</li>
                    ))}
                  </ol>
                )}
                <button className="secondary-btn" type="button" onClick={() => handlePlanActivity(activity)}>
                  Plan This Activity
                </button>
              </article>
            ))}
        </section>
      </div>
    );
  }

  function renderReportsTab() {
    return (
      <div className="tab-panel">
        <section className="card report-action-card">
          <div>
            <p className="eyebrow">Weekly Screening</p>
            <h2>Generate Weekly Report</h2>
            <p>
              Reports combine parent logs, age-normalized milestone features, ML prediction, and transparent fallback rules.
            </p>
          </div>
          <button
            className="primary-btn"
            type="button"
            onClick={handleGenerateReport}
            disabled={pending || requiresConsent || !selectedChildId}
          >
            Generate Weekly Report
          </button>
        </section>
        <section className="card">
          <h2>Report History</h2>
          <div className="report-list">
            {reports.length === 0 && <p>No reports generated yet.</p>}
            {reports.map((report) => renderReportCard(report))}
          </div>
        </section>
      </div>
    );
  }

  function renderInsightsTab() {
    const checklist = [
      {
        label: 'At least 4 logs in the last 30 days',
        done: (dashboard?.stats?.logsLast30Days || 0) >= 4
      },
      {
        label: 'All four developmental domains have activity',
        done: Object.values(dashboard?.stats?.domainTotals || {}).filter((value) => Number(value) > 0).length === 4
      },
      {
        label: 'Latest weekly report generated',
        done: Boolean(dashboard?.latestReport)
      },
      {
        label: 'Consent and data-use acknowledgments complete',
        done: !requiresConsent
      }
    ];

    return (
      <div className="tab-panel grid two-col">
        <article className="card">
          <p className="eyebrow">Readiness Score</p>
          <h2>{readinessScore}%</h2>
          <p>
            A lightweight quality score based on logging consistency, domain coverage, report freshness, and consent completeness.
          </p>
          <progress max="100" value={readinessScore} />
        </article>
        <article className="card">
          <p className="eyebrow">Success Mix</p>
          <h2>{masteryRate}% completed/mastered</h2>
          <p>Calculated from the selected child&apos;s last 30 days of parent logs.</p>
          <div className="probability-grid">
            {Object.entries(dashboard?.stats?.successCounts || {}).map(([label, value]) => (
              <div className="probability-item" key={label}>
                <span>{label.replace('_', ' ')}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <h2>Domain Coverage</h2>
          <p>
            Strongest domain: <strong>{strongestDomain ? domainLabels[strongestDomain[0]] : 'N/A'}</strong>
          </p>
          <p>
            Next focus: <strong>{focusDomain ? domainLabels[focusDomain[0]] : 'N/A'}</strong>
          </p>
          <div className="domain-bars">
            {Object.entries(dashboard?.stats?.domainTotals || {}).map(([domain, value]) => (
              <div key={domain}>
                <div className="domain-row">
                  <span>{domainLabels[domain] || domain}</span>
                  <span>{value}</span>
                </div>
                <progress max="20" value={Math.min(value, 20)} />
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <h2>Quality Checklist</h2>
          <div className="checklist">
            {checklist.map((item) => (
              <div className={`checklist-item ${item.done ? 'checklist-done' : ''}`} key={item.label}>
                <span>{item.done ? 'Done' : 'Todo'}</span>
                <strong>{item.label}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="card wide-card">
          <h2>Recommended Next Actions</h2>
          <div className="next-action-grid">
            <button className="secondary-btn" type="button" onClick={() => setActiveTab('activities')}>
              Pick a {focusDomain ? domainLabels[focusDomain[0]] : 'guided'} activity
            </button>
            <button className="secondary-btn" type="button" onClick={() => setActiveTab('children')}>
              Add today&apos;s observation
            </button>
            <button className="secondary-btn" type="button" onClick={() => setActiveTab('reports')}>
              Refresh weekly report
            </button>
          </div>
        </article>
      </div>
    );
  }

  function renderProfileTab() {
    return (
      <div className="tab-panel grid two-col">
        <article className="card">
          <h2>Parent Profile</h2>
          <form className="form-grid" onSubmit={handleProfileUpdate}>
            <label>
              Display Name
              <input
                value={profileForm.displayName}
                onChange={(event) => setProfileForm({ displayName: event.target.value })}
              />
            </label>
            <button className="primary-btn" type="submit" disabled={pending}>
              Save Profile
            </button>
          </form>
        </article>
        <article className="card profile-meta-card">
          <h2>Account Details</h2>
          <p><strong>Email:</strong> {profile?.email || user?.email}</p>
          <p><strong>Role:</strong> {profile?.role || 'parent'}</p>
          <p><strong>Consent:</strong> {consent?.hasAcceptedConsent ? 'Accepted' : 'Not accepted'}</p>
          <p><strong>Joined:</strong> {formatDate(profile?.createdAt)}</p>
        </article>
        <article className="card">
          <h2>Profile Snapshot</h2>
          <div className="stats-grid">
            <div className="stat-box">
              <span>Children</span>
              <strong>{children.length}</strong>
            </div>
            <div className="stat-box">
              <span>Total Reports</span>
              <strong>{reports.length}</strong>
            </div>
            <div className="stat-box">
              <span>Recent Logs</span>
              <strong>{dashboard?.stats?.logsLast30Days || 0}</strong>
            </div>
            <div className="stat-box">
              <span>Readiness</span>
              <strong>{readinessScore}%</strong>
            </div>
          </div>
        </article>
        <article className="card">
          <h2>Child Roster</h2>
          {children.length === 0 && <p>No children have been added yet.</p>}
          {children.map((child) => (
            <div className="mini-list-item" key={child._id}>
              <strong>{child.nickname}</strong>
              <span>{child.ageInMonths} months - {child.sex || 'sex not specified'}</span>
            </div>
          ))}
        </article>
      </div>
    );
  }

  function renderSettingsTab() {
    return (
      <div className="tab-panel grid two-col">
        <article className="card">
          <h2>App Preferences</h2>
          <div className="settings-row">
            <div>
              <strong>Theme</strong>
              <p>Current mode: {theme}</p>
            </div>
            <button className="theme-toggle-btn" type="button" onClick={toggleTheme}>
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
          <div className="settings-row">
            <div>
              <strong>Password</strong>
              <p>Send a Firebase password reset email to {profile?.email || user?.email}.</p>
            </div>
            <button className="secondary-btn" type="button" onClick={handlePasswordReset} disabled={pending}>
              Send Reset Email
            </button>
          </div>
          {renderMlStatusCard()}
        </article>
        <article className="card privacy-card">
          <h2>Privacy &amp; Data</h2>
          <p>
            You can export your account data at any time. Deleting your account permanently removes parent, child, log, and report records from SAPNA.
          </p>
          <div className="privacy-actions">
            <button className="secondary-btn" type="button" onClick={handleExportData} disabled={pending}>
              Export My Data
            </button>
          </div>
          <div className="danger-zone">
            <label>
              Type <strong>DELETE MY DATA</strong> to confirm permanent deletion
              <input
                value={deleteConfirmationText}
                onChange={(event) => setDeleteConfirmationText(event.target.value)}
                placeholder="DELETE MY DATA"
              />
            </label>
            <button
              className="danger-btn"
              type="button"
              onClick={handleDeleteAccount}
              disabled={pending || deleteConfirmationText !== 'DELETE MY DATA'}
            >
              Delete My Account/Data
            </button>
          </div>
        </article>
        <article className="card disclaimer-card wide-card">
          <strong>Medical Disclaimer:</strong>{' '}
          {dashboard?.medicalDisclaimer ||
            'This tool supports developmental screening and monitoring only. It does not provide a medical diagnosis.'}
        </article>
        <article className="card wide-card">
          <h2>Operational Status</h2>
          <div className="settings-status-grid">
            <div className="stat-box">
              <span>API</span>
              <strong>{mlHealth?.ok ? 'Online' : 'Checking'}</strong>
            </div>
            <div className="stat-box">
              <span>MongoDB</span>
              <strong>{mlHealth?.mongoState || 'N/A'}</strong>
            </div>
            <div className="stat-box">
              <span>Firebase</span>
              <strong>{mlHealth?.firebaseConfigured ? 'Configured' : 'Unavailable'}</strong>
            </div>
            <div className="stat-box">
              <span>ML</span>
              <strong>{mlHealth?.mlServiceReachable ? 'Online' : 'Fallback'}</strong>
            </div>
          </div>
        </article>
      </div>
    );
  }

  function renderAboutTab() {
    return (
      <div className="tab-panel grid two-col">
        <article className="card">
          <p className="eyebrow">About SAPNA</p>
          <h2>Parent-mediated toddler monitoring</h2>
          <p>
            SAPNA helps parents record offline guided activities for toddlers aged 12-36 months, summarize observations, and identify areas that may need closer monitoring.
          </p>
          <p>
            It is intentionally parent-facing and designed to reduce toddler screen exposure while supporting structured observation.
          </p>
        </article>
        <article className="card">
          <p className="eyebrow">ML Methodology</p>
          <h2>Screening support, not diagnosis</h2>
          <p>
            Weekly reports use age-normalized log features, a compact Random Forest model selected from RF/SVM/Hybrid RF evaluation, and a rules fallback when confidence is low.
          </p>
          <p>
            SAPNA does not provide clinical diagnosis. Parents should consult qualified healthcare professionals for formal assessment.
          </p>
        </article>
        <article className="card wide-card">
          <h2>Privacy Summary</h2>
          <p>
            Data is tied to the authenticated parent account, consent is required before logging, and parents can export or delete app data from Settings.
          </p>
        </article>
        <article className="card wide-card">
          <h2>Quality &amp; Safety Features</h2>
          <div className="feature-grid">
            <div>
              <strong>Domain isolation</strong>
              <p>SAPNA runs as its own frontend, backend process, and ML sidecar without sharing routes with other sites.</p>
            </div>
            <div>
              <strong>Resilient reports</strong>
              <p>Weekly reports fall back to rules if the ML service is unavailable or below confidence threshold.</p>
            </div>
            <div>
              <strong>Data ownership</strong>
              <p>Parents can export or delete their SAPNA app data from Settings at any time.</p>
            </div>
            <div>
              <strong>Audit-friendly consent</strong>
              <p>Consent records include screening-only and data-use acknowledgments with a versioned policy.</p>
            </div>
          </div>
        </article>
      </div>
    );
  }

  function renderAdminTab() {
    if (!isAdmin) {
      return null;
    }

    return (
      <div className="tab-panel admin-panel">
        <section className="card">
          <div className="admin-header-row">
            <div>
              <p className="eyebrow">Admin Panel</p>
              <h2>System Management</h2>
            </div>
            <button className="secondary-btn" type="button" onClick={() => loadAdminData()} disabled={pending}>
              Refresh Admin Data
            </button>
          </div>
          {adminSummary && (
            <div className="stats-grid admin-stats-grid">
              <div className="stat-box"><span>Parents</span><strong>{adminSummary.parents}</strong></div>
              <div className="stat-box"><span>Children</span><strong>{adminSummary.children}</strong></div>
              <div className="stat-box"><span>Logs</span><strong>{adminSummary.logs}</strong></div>
              <div className="stat-box"><span>Reports</span><strong>{adminSummary.reports}</strong></div>
              <div className="stat-box"><span>Recent Logs</span><strong>{adminSummary.recentLogs}</strong></div>
              <div className="stat-box"><span>ML</span><strong>{adminSummary.mlHealth?.mlServiceReachable ? 'Online' : 'Fallback'}</strong></div>
            </div>
          )}
        </section>

        <section className="grid two-col">
          <article className="card">
            <h2>Parents</h2>
            <form className="admin-search" onSubmit={handleAdminSearch}>
              <input
                value={adminQuery}
                onChange={(event) => setAdminQuery(event.target.value)}
                placeholder="Search by email or name"
              />
              <button className="secondary-btn" type="submit">Search</button>
            </form>
            <p>{adminPagination ? `${adminPagination.total} parent accounts` : 'Loading parent accounts...'}</p>
            <div className="admin-parent-list">
              {adminParents.map((parent) => (
                <button
                  key={parent._id}
                  type="button"
                  className="admin-parent-row"
                  onClick={() => loadAdminParent(parent._id)}
                >
                  <span><strong>{parent.email}</strong>{parent.displayName ? ` - ${parent.displayName}` : ''}</span>
                  <span>{parent.role || 'parent'} - {parent.counts.children} children - {parent.counts.logs} logs</span>
                </button>
              ))}
            </div>
          </article>

          <article className="card">
            <h2>Selected Parent</h2>
            {!adminSelectedParent && <p>Select a parent to manage data and roles.</p>}
            {adminSelectedParent && (
              <div className="admin-detail">
                <p><strong>Email:</strong> {adminSelectedParent.parent.email}</p>
                <p><strong>Display Name:</strong> {adminSelectedParent.parent.displayName || 'Not set'}</p>
                <label>
                  Role
                  <select
                    value={adminSelectedParent.parent.role || 'parent'}
                    onChange={(event) =>
                      handleAdminParentUpdate(adminSelectedParent.parent._id, { role: event.target.value })
                    }
                  >
                    <option value="parent">Parent</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <div className="danger-zone">
                  <label>
                    Type <strong>DELETE USER DATA</strong> to delete this user&apos;s SAPNA app data
                    <input
                      value={adminConfirmation}
                      onChange={(event) => setAdminConfirmation(event.target.value)}
                      placeholder="DELETE USER DATA"
                    />
                  </label>
                  <button
                    className="danger-btn"
                    type="button"
                    disabled={pending || adminConfirmation !== 'DELETE USER DATA'}
                    onClick={() => handleAdminDeleteUserData(adminSelectedParent.parent._id)}
                  >
                    Delete User App Data
                  </button>
                </div>
              </div>
            )}
          </article>
        </section>

        {adminSelectedParent && (
          <section className="grid two-col">
            <article className="card">
              <h2>Children</h2>
              {adminSelectedParent.children.map((child) => (
                <div className="admin-resource-row" key={child._id}>
                  <span>{child.nickname} ({child.ageInMonths}m)</span>
                  <button
                    className="danger-link"
                    type="button"
                    onClick={() => handleAdminDeleteResource(`/admin/children/${child._id}`, 'DELETE CHILD DATA')}
                  >
                    Delete child data
                  </button>
                </div>
              ))}
            </article>
            <article className="card">
              <h2>Reports</h2>
              {adminSelectedParent.reports.slice(0, 8).map((report) => (
                <div className="admin-resource-row" key={report._id}>
                  <span>{formatDate(report.weekStart)} - {statusLabels[report.status] || report.status}</span>
                  <button
                    className="danger-link"
                    type="button"
                    onClick={() => handleAdminDeleteResource(`/admin/reports/${report._id}`, 'DELETE REPORT')}
                  >
                    Delete report
                  </button>
                </div>
              ))}
            </article>
            <article className="card wide-card">
              <h2>Recent Logs</h2>
              {adminSelectedParent.logs.slice(0, 12).map((log) => (
                <div className="admin-resource-row" key={log._id}>
                  <span>{formatDate(log.completedAt)} - {log.activityId?.title || 'Activity'} - {log.successLevel}</span>
                  <button
                    className="danger-link"
                    type="button"
                    onClick={() => handleAdminDeleteResource(`/admin/logs/${log._id}`, 'DELETE LOG')}
                  >
                    Delete log
                  </button>
                </div>
              ))}
            </article>
          </section>
        )}
      </div>
    );
  }

  function renderActiveTab() {
    if (activeTab === 'children') return renderChildrenTab();
    if (activeTab === 'activities') return renderActivitiesTab();
    if (activeTab === 'reports') return renderReportsTab();
    if (activeTab === 'insights') return renderInsightsTab();
    if (activeTab === 'profile') return renderProfileTab();
    if (activeTab === 'settings') return renderSettingsTab();
    if (activeTab === 'about') return renderAboutTab();
    if (activeTab === 'admin') return renderAdminTab();
    return renderOverviewTab();
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar card">
        <div>
          <p className="eyebrow">Secure Parent Workspace</p>
          <h1>SAPNA Monitoring Dashboard</h1>
          <p>{profile?.displayName || profile?.email || user?.email}</p>
        </div>
        <div className="topbar-actions">
          <button className="theme-toggle-btn" type="button" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button className="secondary-btn" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <nav className="tab-nav card" aria-label="Dashboard sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? 'tab-button-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error && <section className="card error-text">{error}</section>}
      {actionMessage && <section className="card success-text">{actionMessage}</section>}

      {renderActiveTab()}
    </main>
  );
}
