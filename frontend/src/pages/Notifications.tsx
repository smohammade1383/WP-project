import { useState } from 'react';
import './Notifications.css';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  date: string;
  read: boolean;
}

const Notifications = () => {
  // Mock notifications - in real app, this would come from API
  const [notifications] = useState<Notification[]>([
    {
      id: 1,
      title: 'خوش آمدید',
      message: 'به سامانه مدیریت پلیس خوش آمدید',
      type: 'success',
      date: '۱۴۰۴/۱۱/۲۱',
      read: false,
    },
    {
      id: 2,
      title: 'به‌روزرسانی سیستم',
      message: 'سیستم با موفقیت به‌روزرسانی شد',
      type: 'info',
      date: '۱۴۰۴/۱۱/۲۰',
      read: true,
    },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '📢';
    }
  };

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h1>🔔 اعلان‌ها</h1>
        {unreadCount > 0 && (
          <span className="unread-badge">{unreadCount} اعلان خوانده نشده</span>
        )}
      </div>

      <div className="notifications-content">
        {notifications.length === 0 ? (
          <div className="no-notifications">
            <div className="empty-icon">🔕</div>
            <h2>اعلانی وجود ندارد</h2>
            <p>هیچ اعلان جدیدی برای نمایش وجود ندارد</p>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`notification-card ${notification.type} ${
                  notification.read ? 'read' : 'unread'
                }`}
              >
                <div className="notification-icon">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="notification-content">
                  <div className="notification-header-row">
                    <h3>{notification.title}</h3>
                    <span className="notification-date">{notification.date}</span>
                  </div>
                  <p>{notification.message}</p>
                  {!notification.read && (
                    <span className="new-badge">جدید</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="notifications-info">
          <div className="info-card">
            <h3>ℹ️ راهنما</h3>
            <p>اعلان‌های مربوط به فعالیت‌های شما در سیستم در این صفحه نمایش داده می‌شود.</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', opacity: 0.8 }}>
              * سیستم اعلان‌رسانی به زودی فعال خواهد شد
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
