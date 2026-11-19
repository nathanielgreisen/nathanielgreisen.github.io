import AuthPanel from './components/AuthPanel';
import Board from './components/Board';
import { useAuth } from './auth';
import { backendConfigured } from './deployment';

export default function App() {
  const { session } = useAuth();
  return <main>
    <h1>r/place copy</h1>
    {backendConfigured ? <>
      <AuthPanel />
      <Board key={session?.token ?? 'guest'} />
    </> : <p role="status">This canvas is not connected to its server yet. Please check back soon.</p>}
  </main>;
}
