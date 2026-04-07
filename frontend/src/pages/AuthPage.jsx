import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

export default function AuthPage() {
  const { login, signup, configError } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (configError) {
      setError(configError);
      return;
    }

    if (mode === 'signup' && form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await signup(form.email, form.password);
      }
    } catch (authError) {
      setError(authError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="app-shell auth-shell">
      <section className="theme-row auth-theme-row">
        <button className="theme-toggle-btn" type="button" onClick={toggleTheme}>
          {theme === 'dark' ? 'Switch To Light' : 'Switch To Dark'}
        </button>
      </section>

      <section className="hero-card">
        <p className="eyebrow">Parent-Centric Monitoring</p>
        <h1>SAPNA Toddler Development Dashboard</h1>
        <p>
          Track offline milestone activities, log developmental observations, and receive
          personalized weekly progress insights without increasing toddler screen exposure.
        </p>
        <p className="medical-disclaimer-inline">
          Medical Disclaimer: SAPNA is a screening and monitoring aid, not a medical diagnosis.
          Always consult a qualified healthcare professional for formal assessment.
        </p>
        <ul>
          <li>Guided activities mapped to 12-36 month milestones</li>
          <li>Consent-driven and parent-mediated data collection</li>
          <li>Rule-based weekly screening summaries with safety disclaimers</li>
        </ul>
      </section>

      <section className="card auth-card">
        <div className="auth-toggle">
          <button
            className={mode === 'login' ? 'active' : ''}
            type="button"
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            type="button"
            onClick={() => setMode('signup')}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              minLength={6}
              required
            />
          </label>

          {mode === 'signup' && (
            <label>
              Confirm Password
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
                minLength={6}
                required
              />
            </label>
          )}

          {error && <p className="error-text">{error}</p>}
          {configError && <p className="warning-text">Firebase setup is incomplete. Add frontend env keys.</p>}

          <button className="primary-btn" type="submit" disabled={pending}>
            {pending ? 'Please wait...' : mode === 'login' ? 'Login to Dashboard' : 'Create Account'}
          </button>
        </form>
      </section>
    </main>
  );
}
