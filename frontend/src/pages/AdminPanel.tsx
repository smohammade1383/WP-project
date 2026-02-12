import { useEffect, useMemo, useState } from 'react';
import { usersApi, type AdminRole } from '../services';
import type { User } from '../services/auth.api';
import './AdminPanel.css';

const AdminPanel = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = async (query?: string) => {
    try {
      setLoadingUsers(true);
      const data = await usersApi.listUsers(query);
      setUsers(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت لیست کاربران');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchRoles = async () => {
    try {
      setLoadingRoles(true);
      const data = await usersApi.listRoles();
      setRoles(data);
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت نقش‌ها');
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const term = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const fullName = `${user.first_name} ${user.last_name}`.trim().toLowerCase();
      return (
        user.username.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.phone_number.includes(term) ||
        user.national_id.includes(term) ||
        fullName.includes(term)
      );
    });
  }, [searchQuery, users]);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setSelectedRoles(user.role_names || []);
    setSuccess('');
  };

  const toggleRole = (roleName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName)
        ? prev.filter((role) => role !== roleName)
        : [...prev, roleName]
    );
  };

  const handleSaveRoles = async () => {
    if (!selectedUser) return;

    const current = new Set(selectedUser.role_names || []);
    const next = new Set(selectedRoles);
    const toAdd = Array.from(next).filter((role) => !current.has(role));
    const toRemove = Array.from(current).filter((role) => !next.has(role));

    if (toAdd.length === 0 && toRemove.length === 0) {
      setSuccess('تغییری برای ذخیره وجود ندارد');
      return;
    }

    try {
      setSaving(true);
      if (toAdd.length > 0) {
        await usersApi.addRoles(selectedUser.id, toAdd);
      }
      if (toRemove.length > 0) {
        await usersApi.removeRoles(selectedUser.id, toRemove);
      }

      const updatedUsers = users.map((user) =>
        user.id === selectedUser.id ? { ...user, role_names: selectedRoles } : user
      );
      setUsers(updatedUsers);
      setSelectedUser((prev) => (prev ? { ...prev, role_names: selectedRoles } : prev));
      setSuccess('نقش‌ها با موفقیت به‌روزرسانی شدند');
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره نقش‌ها');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-panel-page">
      <div className="admin-panel-header">
        <div>
          <h1>⚙️ پنل ادمین</h1>
          <p>مدیریت کاربران و تخصیص نقش‌ها</p>
        </div>
        <button className="refresh-btn" onClick={() => fetchUsers(searchQuery)} disabled={loadingUsers}>
          {loadingUsers ? 'در حال بارگذاری...' : 'بارگذاری مجدد'}
        </button>
      </div>

      {(error || success) && (
        <div className={`admin-panel-message ${error ? 'error' : 'success'}`}>
          {error || success}
        </div>
      )}

      <div className="admin-panel-search">
        <input
          type="text"
          placeholder="جستجو بر اساس نام، نام کاربری، ایمیل، شماره یا کد ملی"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <button onClick={() => fetchUsers(searchQuery)} disabled={loadingUsers}>
          جستجو
        </button>
      </div>

      <div className="admin-panel-grid">
        <div className="users-list">
          <h3>لیست کاربران</h3>
          {loadingUsers ? (
            <div className="skeleton-list">در حال دریافت کاربران...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state">کاربری یافت نشد.</div>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                className={`user-card ${selectedUser?.id === user.id ? 'active' : ''}`}
                onClick={() => handleSelectUser(user)}
              >
                <div className="user-info">
                  <strong>{user.first_name || user.last_name ? `${user.first_name} ${user.last_name}` : user.username}</strong>
                  <span>@{user.username}</span>
                  <span>{user.email}</span>
                </div>
                <div className="role-badges">
                  {(user.role_names || []).map((role) => (
                    <span key={role} className="role-chip">
                      {role}
                    </span>
                  ))}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="roles-panel">
          <h3>مدیریت نقش</h3>
          {!selectedUser ? (
            <div className="empty-state">یک کاربر را برای مدیریت نقش انتخاب کنید.</div>
          ) : (
            <>
              <div className="selected-user">
                <div>
                  <strong>{selectedUser.first_name || selectedUser.last_name ? `${selectedUser.first_name} ${selectedUser.last_name}` : selectedUser.username}</strong>
                  <p>کد ملی: {selectedUser.national_id}</p>
                </div>
                <span className={`status-pill ${selectedUser.is_active ? 'active' : 'inactive'}`}>
                  {selectedUser.is_active ? 'فعال' : 'غیرفعال'}
                </span>
              </div>

              {loadingRoles ? (
                <div className="skeleton-list">در حال دریافت نقش‌ها...</div>
              ) : (
                <div className="roles-list">
                  {roles.map((role) => (
                    <label key={role.id} className="role-option">
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.name)}
                        onChange={() => toggleRole(role.name)}
                      />
                      <span>{role.name}</span>
                    </label>
                  ))}
                </div>
              )}

              <button className="save-btn" onClick={handleSaveRoles} disabled={saving}>
                {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
