import AuthPanel from './components/AuthPanel';
import Board from './components/Board';
import { useAuth } from './auth';

export default function App() {
  const { session } = useAuth();
  return <main>
    <h1>Collaborative Pixel Canvas</h1>
    <AuthPanel />
    <Board key={session?.token ?? 'guest'} />
  </main>;
}
