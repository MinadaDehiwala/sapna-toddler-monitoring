import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const successOptions = [
  { value: 'needs_help', label: 'Needs Help' },
  { value: 'partial', label: 'Partial Success' },
  { value: 'completed', label: 'Completed' },
  { value: 'mastered', label: 'Mastered' }
];

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const [profile, setProfile] = useState(null);
  const [consent, setConsent] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState([]);

  const [childForm, setChildForm] = useState({ nickname: '', dateOfBirth: '', sex: '' });
  const [logForm, setLogForm] = useState({
    activityId: '',
    durationMinutes: 10,
    successLevel: 'completed',
    parentConfidence: 3,
    notes: ''
  });

  const selectedChild = useMemo(
    () => children.find((item) => item._id === selectedChildId) || null,
    [children, selectedChildId]
  );

  async function getToken() {
    return user.getIdToken();
  }

  async function callApi(path, options = {}) {
    const token = await getToken();
    return apiRequest(path, { ...options, token });
  }

  async function loadBaseData() {
    setError('');
    setPending(true);
    try {
      const [profileData, consentData, childrenData] = await Promise.all([
        callApi('/auth/me'),
        callApi('/consent/status'),
        callApi('/children')
      ]);

      setProfile(profileData.parent);
      setConsent(consentData);
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

  useEffect(() => {
    loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadChildData(selectedChildId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  async function handleConsentAccept() {
    setPending(true);
    setError('');
    try {
      const consentData = await callApi('/consent', { method: 'POST', body: {} });
      setConsent(consentData);
      await loadBaseData();
    } catch (consentError) {
      setError(consentError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleCreateChild(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await callApi('/children', { method: 'POST', body: childForm });
      setChildForm({ nickname: '', dateOfBirth: '', sex: '' });
      await loadBaseData();
    } catch (childError) {
      setError(childError.message);
    } finally {
      setPending(false);
    }
  }

  async function handleCreateLog(event) {
    event.preventDefault();
    if (!selectedChildId) {
      setError('Create or select a child profile first.');
      return;
    }

    setPending(true);
    setError('');

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
      await loadChildData(selectedChildId);
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

    try {
      await callApi('/reports/generate-weekly', {
        method: 'POST',
        body: { childId: selectedChildId }
      });
      await loadChildData(selectedChildId);
    } catch (reportError) {
      setError(reportError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar card">
        <div>
          <p className="eyebrow">Secure Parent Workspace</p>
          <h1>SAPNA Monitoring Dashboard</h1>
          <p>{profile?.email || user?.email}</p>
        </div>
        <button className="secondary-btn" type="button" onClick={logout}>
          Logout
        </button>
      </header>

      {error && <section className="card error-text">{error}</section>}

      <section className="card disclaimer-card">
        <strong>Medical Disclaimer:</strong> This tool supports developmental screening and monitoring
        only. It does not provide a medical diagnosis.
      </section>

      {!consent?.hasAcceptedConsent && (
        <section className="card consent-card">
          <h2>Parental Consent Required</h2>
          <p>
            Before storing any developmental logs, please confirm consent for parent-reported data
            collection and secure processing.
          </p>
          <button className="primary-btn" type="button" disabled={pending} onClick={handleConsentAccept}>
            I Accept Consent Terms
          </button>
        </section>
      )}

      <section className="grid two-col">
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
                onChange={(event) =>
                  setChildForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))
                }
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
          <h2>Weekly Insights</h2>
          <button
            className="primary-btn"
            type="button"
            onClick={handleGenerateReport}
            disabled={pending || !consent?.hasAcceptedConsent || !selectedChildId}
          >
            Generate Weekly Report
          </button>

          <div className="report-list">
            {reports.length === 0 && <p>No reports generated yet.</p>}
            {reports.map((report) => (
              <div className="report-item" key={report._id}>
                <p>
                  <strong>{new Date(report.weekStart).toLocaleDateString()}</strong> - {report.status}
                </p>
                <p>{report.summary}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid two-col">
        <article className="card">
          <h2>Log Offline Activity</h2>
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
              Duration (minutes)
              <input
                type="number"
                min="1"
                max="240"
                value={logForm.durationMinutes}
                onChange={(event) =>
                  setLogForm((prev) => ({ ...prev, durationMinutes: event.target.value }))
                }
                required
              />
            </label>

            <label>
              Success Level
              <select
                value={logForm.successLevel}
                onChange={(event) =>
                  setLogForm((prev) => ({ ...prev, successLevel: event.target.value }))
                }
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
                onChange={(event) =>
                  setLogForm((prev) => ({ ...prev, parentConfidence: event.target.value }))
                }
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

            <button
              className="primary-btn"
              type="submit"
              disabled={pending || !consent?.hasAcceptedConsent || !selectedChildId}
            >
              Save Activity Log
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Progress Snapshot (Last 30 Days)</h2>
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

              <div className="domain-bars">
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

              {dashboard.latestReport && (
                <div className="report-item">
                  <h3>Latest Weekly Summary</h3>
                  <p>{dashboard.latestReport.summary}</p>
                </div>
              )}
            </>
          )}
        </article>
      </section>

      <section className="card">
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
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id}>
                    <td>{new Date(log.completedAt).toLocaleDateString()}</td>
                    <td>{log.activityId?.title || 'Unknown'}</td>
                    <td>{log.activityId?.domain || '-'}</td>
                    <td>{log.successLevel.replace('_', ' ')}</td>
                    <td>{log.durationMinutes}</td>
                    <td>{log.parentConfidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
