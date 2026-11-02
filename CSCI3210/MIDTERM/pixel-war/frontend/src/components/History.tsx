import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import type { HistoryEntry } from '../types';

export default function History() {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  const [message, setMessage] = useState('Loading history…');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await api.history()); setMessage('Latest 50 placements.'); }
    catch (error: unknown) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section aria-label="Audit history">
    <h2>Placement history</h2>
    <button onClick={() => void load()} disabled={busy}>Refresh history</button>
    <p role="status">{message}</p>
    <div className="table-scroll"><table>
      <caption>Accepted placements, newest first</caption>
      <thead><tr><th>Version</th><th>User</th><th>Coordinate</th><th>Color</th><th>Time</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{row.version}</td><td>{row.username}</td><td>{row.x}, {row.y}</td>
        <td>{row.color}</td><td>{new Date(row.created_at).toLocaleString()}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
