'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface UserInfo {
  email: string;
  role: string;
  createdAt: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [error, setError] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    if (res.status === 401 || res.status === 403) {
      router.push('/login');
      return;
    }
    setUsers(await res.json());
  }

  async function addNewUser() {
    setError('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setShowModal(false);
    setNewEmail('');
    setNewPassword('');
    setNewRole('user');
    loadUsers();
  }

  async function deleteUser(email: string) {
    if (!confirm(`Remove ${email}?`)) return;
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    loadUsers();
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>User Management</h1>
          <div className="subtitle">Add or remove users who can access AIO TaskSync</div>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => router.push('/')}>Back to Sync</button>
          <button className="btn btn-ghost" onClick={() => setShowModal(true)}>+ Add User</button>
        </div>
      </div>

      <div className="container">
        <div className="card">
          <h2>Users ({users.length})</h2>
          {users.map(u => (
            <div key={u.email} className="user-row">
              <div>
                <span className="user-email">{u.email}</span>
                <span className={`user-role ${u.role}`} style={{ marginLeft: 10 }}>{u.role}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#888' }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </span>
                {u.role !== 'admin' && (
                  <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.email)}>Remove</button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && <p style={{ color: '#888', padding: 20 }}>No users found</p>}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add New User</h2>
            {error && <div className="form-error">{error}</div>}
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={addNewUser}>Add User</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
