import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import type { LeaderboardEntry } from '../types';

export default function Leaderboard() {
  const [leaders, setLeaders] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let loading = false;

    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const rows = await api.leaderboard();
        if (active) {
          setLeaders(rows);
          setError('');
        }
      } catch (failure: unknown) {
        if (active) setError(errorMessage(failure));
      } finally {
        loading = false;
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return <aside className="leaderboard" aria-labelledby="leaderboard-title">
    <h2 id="leaderboard-title">Leaderboard</h2>
    {error && <p role="status">{error}</p>}
    {!leaders && !error && <p role="status">Loading leaderboard…</p>}
    {leaders?.length === 0 && <p>No pixels placed yet.</p>}
    {leaders && leaders.length > 0 && <table>
      <caption>Top 10 users by pixels placed</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">User</th><th scope="col">Pixels</th></tr></thead>
      <tbody>{leaders.map(({ username, placements }, index) => <tr key={username}>
        <td>{index + 1}</td><td>{username}</td><td>{placements.toLocaleString()}</td>
      </tr>)}</tbody>
    </table>}
  </aside>;
}
