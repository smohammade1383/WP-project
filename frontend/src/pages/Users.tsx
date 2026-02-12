import { useEffect, useMemo, useRef, useState } from 'react';
import { usersApi, type AdminRole } from '../services';
import type { User } from '../services/auth.api';
import './Users.css';

type UserEditForm = {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  national_id: string;
  is_active: boolean;
  role_names: string[];
  password: string;
  confirm_password: string;
};

const Users = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const lastSearchRef = useRef('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<UserEditForm>({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    national_id: '',
    is_active: true,
    role_names: [],
    password: '',
    confirm_password: '',
  });
  const [originalRoles, setOriginalRoles] = useState<string[]>([]);

  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  const isModalOpen = isEditOpen || Boolean(deletingUser);

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
    setSuccess('');
  };

  const openEditModal = (user: User) => {
    lastSearchRef.current = searchQuery;
    setEditForm({
      username: user.username || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone_number: user.phone_number || '',
      national_id: user.national_id || '',
      is_active: user.is_active,
      role_names: user.role_names || [],
      password: '',
      confirm_password: '',
    });
    setOriginalRoles(user.role_names || []);
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
  };

  const toggleRole = (roleName: string) => {
    setEditForm((prev) => ({
      ...prev,
      role_names: prev.role_names.includes(roleName)
        ? prev.role_names.filter((role) => role !== roleName)
        : [...prev.role_names, roleName],
    }));
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;

    if (editForm.password && editForm.password !== editForm.confirm_password) {
      setError('رمز عبور و تکرار آن یکسان نیستند');
      return;
    }

    try {
      setSavingUser(true);
      const updatedUser = await usersApi.updateUser(selectedUser.id, {
        username: editForm.username,
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        phone_number: editForm.phone_number,
        national_id: editForm.national_id,
        is_active: editForm.is_active,
        ...(editForm.password ? { password: editForm.password } : {}),
      });

      const current = new Set(originalRoles);
      const next = new Set(editForm.role_names);
      const toAdd = Array.from(next).filter((role) => !current.has(role));
      const toRemove = Array.from(current).filter((role) => !next.has(role));

      if (toAdd.length > 0) {
        await usersApi.addRoles(selectedUser.id, toAdd);
      }
      if (toRemove.length > 0) {
        await usersApi.removeRoles(selectedUser.id, toRemove);
      }

      const mergedUser = {
        ...selectedUser,
        ...updatedUser,
        role_names: editForm.role_names,
      };

      setUsers((prev) =>
        prev.map((user) => (user.id === selectedUser.id ? mergedUser : user))
      );
      setSelectedUser(mergedUser);
      setSuccess('اطلاعات کاربر با موفقیت به‌روزرسانی شد');
      setIsEditOpen(false);
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره اطلاعات کاربر');
    } finally {
      setSavingUser(false);
    }
  };

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    document.body.style.overflow = '';
  }, [isModalOpen]);

  useEffect(() => {
    if (isEditOpen) {
      if (searchQuery !== lastSearchRef.current) {
        setSearchQuery(lastSearchRef.current);
      }
    } else {
      lastSearchRef.current = searchQuery;
    }
  }, [isEditOpen, searchQuery]);

  const handleSearchChange = (value: string) => {
    if (isEditOpen) return;
    setSearchQuery(value);
    lastSearchRef.current = value;
  };

  const confirmDeleteUser = (user: User) => {
    setDeletingUser(user);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    try {
      await usersApi.deleteUser(deletingUser.id);
      setUsers((prev) => prev.filter((item) => item.id !== deletingUser.id));
      if (selectedUser?.id === deletingUser.id) {
        setSelectedUser(null);
      }
      setSuccess('کاربر با موفقیت حذف شد');
    } catch (err: any) {
      setError(err.message || 'خطا در حذف کاربر');
    } finally {
      setDeletingUser(null);
    }
  };

  return (
    <div className="users-page">
      <div className="users-header">
        <div>
          <h1>👥 مدیریت کاربران</h1>
          <p>جستجو، ویرایش و مدیریت نقش کاربران</p>
        </div>
        <button type="button" className="refresh-btn" onClick={() => fetchUsers(searchQuery)} disabled={loadingUsers}>
          {loadingUsers ? 'در حال بارگذاری...' : 'بارگذاری مجدد'}
        </button>
      </div>

      {(error || success) && (
        <div className={`users-message ${error ? 'error' : 'success'}`}>
          {error || success}
        </div>
      )}

      <div className="users-search">
        <input
          type="text"
          name="user-search"
          autoComplete="off"
          placeholder="جستجو بر اساس نام، نام کاربری، ایمیل، شماره یا کد ملی"
          value={searchQuery}
          readOnly={isEditOpen}
          onChange={(event) => handleSearchChange(event.target.value)}
        />
        <button type="button" onClick={() => fetchUsers(searchQuery)} disabled={loadingUsers}>
          جستجو
        </button>
      </div>

      <div className="users-grid single-column">
        <div className="users-list">
          <h3>لیست کاربران</h3>
          {loadingUsers ? (
            <div className="skeleton-list">در حال دریافت کاربران...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-state">کاربری یافت نشد.</div>
          ) : (
            <div className="users-scroll">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  role="button"
                  tabIndex={0}
                  className={`user-card ${selectedUser?.id === user.id ? 'active' : ''}`}
                  onClick={() => handleSelectUser(user)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      handleSelectUser(user);
                    }
                  }}
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
                  <div className="user-card-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedUser(user);
                        openEditModal(user);
                      }}
                    >
                      ویرایش
                    </button>
                    <button
                      type="button"
                      className="delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedUser(user);
                        confirmDeleteUser(user);
                      }}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {isEditOpen && selectedUser && (
        <div className="modal-backdrop" onClick={closeEditModal}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>ویرایش اطلاعات کاربر</h3>
              <button type="button" className="close-btn" onClick={closeEditModal}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  نام کاربری
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, username: event.target.value }))}
                  />
                </label>
                <label>
                  نام
                  <input
                    type="text"
                    value={editForm.first_name}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  />
                </label>
                <label>
                  نام خانوادگی
                  <input
                    type="text"
                    value={editForm.last_name}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  />
                </label>
                <label>
                  ایمیل
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </label>
                <label>
                  شماره تماس
                  <input
                    type="text"
                    value={editForm.phone_number}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, phone_number: event.target.value }))}
                  />
                </label>
                <label>
                  کد ملی
                  <input
                    type="text"
                    value={editForm.national_id}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, national_id: event.target.value }))}
                  />
                </label>
                <label>
                  رمز عبور جدید
                  <input
                    type="password"
                    placeholder="اختیاری"
                    value={editForm.password}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                </label>
                <label>
                  تکرار رمز عبور
                  <input
                    type="password"
                    placeholder="اختیاری"
                    value={editForm.confirm_password}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
                  />
                </label>
              </div>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                کاربر فعال است
              </label>

              <div className="roles-checkboxes">
                <h4>نقش‌ها</h4>
                {loadingRoles ? (
                  <div className="skeleton-list">در حال دریافت نقش‌ها...</div>
                ) : (
                  <div className="roles-checkboxes-grid">
                    {roles.map((role) => (
                      <label key={role.id} className="role-option">
                        <input
                          type="checkbox"
                          checked={editForm.role_names.includes(role.name)}
                          onChange={() => toggleRole(role.name)}
                        />
                        <span>{role.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-btn" onClick={closeEditModal}>
                انصراف
              </button>
              <button type="button" className="save-btn" onClick={handleSaveUser} disabled={savingUser}>
                {savingUser ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingUser && (
        <div className="modal-backdrop" onClick={() => setDeletingUser(null)}>
          <div className="modal-card confirm-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>حذف کاربر</h3>
              <button type="button" className="close-btn" onClick={() => setDeletingUser(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>آیا از حذف کاربر «{deletingUser.username}» مطمئن هستید؟</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary-btn" onClick={() => setDeletingUser(null)}>
                انصراف
              </button>
              <button type="button" className="delete-btn" onClick={handleDeleteUser}>
                حذف کاربر
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
