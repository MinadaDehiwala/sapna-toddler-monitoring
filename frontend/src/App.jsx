import { useAuth } from './hooks/useAuth';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <main className="app-shell loading-state">
        <div className="card">
          <h1>Loading SAPNA Dashboard</h1>
          <p>Preparing secure parent workspace...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <DashboardPage />;
}
