import { useEffect, useState } from 'react';
import { usersApi, type AdminRole } from '../services';
import './AdminPanel.css';

type RoleForm = {
  name: string;
  description: string;
};

const AdminPanel = () => {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [savingRole, setSavingRole] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [roleForm, setRoleForm] = useState<RoleForm>({ name: '', description: '' });
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [deletingRole, setDeletingRole] = useState<AdminRole | null>(null);

  const isModalOpen = Boolean(editingRole || deletingRole);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    document.body.style.overflow = '';
  }, [isModalOpen]);

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
    fetchRoles();
  }, []);

  const resetRoleForm = () => {
    setRoleForm({ name: '', description: '' });
    setEditingRole(null);
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      setError('نام نقش الزامی است');
      return;
    }

    try {
      setSavingRole(true);
      if (editingRole) {
        const updated = await usersApi.updateRole(editingRole.id, {
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
        });
        setRoles((prev) => prev.map((role) => (role.id === updated.id ? updated : role)));
        setSuccess('نقش با موفقیت به‌روزرسانی شد');
      } else {
        const created = await usersApi.createRole({
          name: roleForm.name.trim(),
          description: roleForm.description.trim(),
        });
        setRoles((prev) => [...prev, created]);
        setSuccess('نقش جدید ایجاد شد');
      }
      resetRoleForm();
    } catch (err: any) {
      setError(err.message || 'خطا در ذخیره نقش');
    } finally {
      setSavingRole(false);
    }
  };

  const openEditRole = (role: AdminRole) => {
    setRoleForm({ name: role.name, description: role.description || '' });
    setEditingRole(role);
  };

  const confirmDeleteRole = (role: AdminRole) => {
    setDeletingRole(role);
  };

  const handleDeleteRole = async () => {
    if (!deletingRole) return;

    try {
      await usersApi.deleteRole(deletingRole.id);
      setRoles((prev) => prev.filter((item) => item.id !== deletingRole.id));
      setSuccess('نقش حذف شد');
    } catch (err: any) {
      setError(err.message || 'خطا در حذف نقش');
    } finally {
      setDeletingRole(null);
    }
  };

  return (
    <div className="admin-panel-page">
      <div className="admin-panel-header">
        <div>
          <h1>⚙️ پنل ادمین</h1>
          <p>مدیریت نقش‌ها و تنظیمات دسترسی</p>
        </div>
        <button className="refresh-btn" onClick={fetchRoles} disabled={loadingRoles}>
          {loadingRoles ? 'در حال بارگذاری...' : 'بارگذاری مجدد'}
        </button>
      </div>

      {(error || success) && (
        <div className={`admin-panel-message ${error ? 'error' : 'success'}`}>
          {error || success}
        </div>
      )}

      <div className="roles-section">
        <div className="roles-form">
          <h3>افزودن نقش جدید</h3>
          <label>
            نام نقش
            <input
              type="text"
              value={roleForm.name}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            توضیحات
            <textarea
              rows={3}
              value={roleForm.description}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <button className="save-btn" onClick={handleSaveRole} disabled={savingRole}>
            {savingRole ? 'در حال ذخیره...' : 'ایجاد نقش'}
          </button>
        </div>

        <div className="roles-list">
          <div className="roles-list-header">
            <h3>نقش‌های سیستم</h3>
            <span>{roles.length} نقش</span>
          </div>

          {loadingRoles ? (
            <div className="skeleton-list">در حال دریافت نقش‌ها...</div>
          ) : roles.length === 0 ? (
            <div className="empty-state">نقشی ثبت نشده است.</div>
          ) : (
            <div className="roles-scroll">
              {roles.map((role) => (
                <div key={role.id} className="role-item">
                  <div>
                    <strong>{role.name}</strong>
                    <p>{role.description || 'بدون توضیح'}</p>
                  </div>
                  <div className="role-actions">
                    <button className="secondary-btn" onClick={() => openEditRole(role)}>
                      ویرایش
                    </button>
                    <button className="delete-btn" onClick={() => confirmDeleteRole(role)}>
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingRole && (
        <div className="modal-backdrop" onClick={resetRoleForm}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>ویرایش نقش</h3>
              <button type="button" className="close-btn" onClick={resetRoleForm}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label>
                نام نقش
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label>
                توضیحات
                <textarea
                  rows={3}
                  value={roleForm.description}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="secondary-btn" onClick={resetRoleForm}>
                انصراف
              </button>
              <button className="save-btn" onClick={handleSaveRole} disabled={savingRole}>
                {savingRole ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingRole && (
        <div className="modal-backdrop" onClick={() => setDeletingRole(null)}>
          <div className="modal-card confirm-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>حذف نقش</h3>
              <button type="button" className="close-btn" onClick={() => setDeletingRole(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>آیا از حذف نقش «{deletingRole.name}» مطمئن هستید؟</p>
            </div>
            <div className="modal-footer">
              <button className="secondary-btn" onClick={() => setDeletingRole(null)}>
                انصراف
              </button>
              <button className="delete-btn" onClick={handleDeleteRole}>
                حذف نقش
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
