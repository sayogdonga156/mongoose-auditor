import { useState, useEffect } from "react";

const API_BASE = "http://localhost:3000";

function App() {
  const [user, setUser] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [newName, setNewName] = useState("John Doe");
  const [newAge, setNewAge] = useState("30");
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (userId: string) => {
    try {
      const res = await fetch(`${API_BASE}/users/${userId}/audit-logs`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error("Failed to fetch logs", err);
    }
  };

  const handleCreateUser = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          age: Number(newAge),
          password: "secret123",
        }),
      });
      const data = await res.json();
      setUser(data);
      setCurrentUserId(data._id);
      setTimeout(() => fetchLogs(data._id), 300); // Small delay for async hook
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${user._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: newName, 
          age: Number(newAge),
          settings: {
            notifications: {
              email: emailNotif,
              sms: smsNotif
            }
          }
        }),
      });
      const data = await res.json();
      setUser(data);
      setTimeout(() => fetchLogs(user._id), 300);
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (logId: string) => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/audit-logs/${logId}/revert`, { method: "POST" });
      // Re-fetch user data to reflect reverted state
      const res = await fetch(`${API_BASE}/users/${currentUserId}`);
      if (res.ok) {
        setUser(await res.json());
      } else {
        setUser(null);
      }
      setTimeout(() => fetchLogs(currentUserId), 300);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/users/${currentUserId}`, { method: "DELETE" });
      setUser(null);
      setTimeout(() => fetchLogs(currentUserId), 300); // Fetch logs again to show "delete" op
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!currentUserId) return;
    window.open(`${API_BASE}/users/${currentUserId}/export-csv`, "_blank");
  };

  return (
    <div className="dashboard-container">
      <header>
        <h1>Audit Trail Dashboard</h1>
        <p>Real-time MongoDB document tracking & reversion system</p>
      </header>

      <div className="glass-panel">
        <div className="panel-header">
          <h2>👤 User Simulator</h2>
          {currentUserId && (
            <span style={{ color: "var(--text-muted)" }}>ID: {currentUserId}</span>
          )}
        </div>

        <div className="form-group">
          <input
            type="text"
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            type="number"
            placeholder="Age"
            value={newAge}
            onChange={(e) => setNewAge(e.target.value)}
          />

          {!user ? (
            <button
              className="btn"
              onClick={handleCreateUser}
              disabled={loading}
            >
              ➕ Create User
            </button>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={emailNotif} onChange={e => setEmailNotif(e.target.checked)} />
                Email Notifs
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={smsNotif} onChange={e => setSmsNotif(e.target.checked)} />
                SMS Notifs
              </label>

              <button
                className="btn"
                onClick={handleUpdateUser}
                disabled={loading}
              >
                🔄 Update User
              </button>
              
              <button
                className="btn btn-danger"
                onClick={handleDeleteUser}
                disabled={loading}
              >
                🗑️ Delete User
              </button>
            </>
          )}
        </div>

        {user && (
          <div
            style={{
              background: "rgba(0,0,0,0.2)",
              padding: "1rem",
              borderRadius: "8px",
            }}
          >
            <p style={{ margin: 0 }}>
              <strong>Current State in DB:</strong> {JSON.stringify(user)}
            </p>
          </div>
        )}
      </div>

      <div className="glass-panel">
        <div className="panel-header">
          <h2>📝 Audit History</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentUserId && (
              <button className="btn btn-outline" onClick={downloadCSV}>
                ⬇️ Export CSV (Document)
              </button>
            )}
            <button className="btn btn-outline" onClick={() => window.open(`${API_BASE}/audit-logs/by-model/User/export-csv`, '_blank')}>
              ⬇️ Export CSV (All Users)
            </button>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Operation</th>
                <th>Timestamp</th>
                <th>Changes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      {currentUserId
                        ? "No logs found."
                        : "Create a user to see the audit trail in action."}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id}>
                    <td>
                      <span className={`badge badge-${log.operation}`}>
                        {log.operation}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td>
                      {log.changes && log.changes.length > 0 ? (
                        <ul className="changes-list">
                          {log.changes.map((c: any, i: number) => (
                            <li key={i}>
                              <span className="field-name">{c.field}</span>:{" "}
                              {JSON.stringify(c.from)} ➡️ {JSON.stringify(c.to)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>
                          No explicit changes
                        </span>
                      )}
                    </td>
                    <td>
                      {log.operation === "update" && (
                        <button
                          className="btn btn-danger"
                          style={{
                            padding: "0.5rem 1rem",
                            fontSize: "0.85rem",
                          }}
                          onClick={() => handleRevert(log._id)}
                          disabled={loading}
                        >
                          ⏪ Revert
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
