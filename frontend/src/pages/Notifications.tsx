import { useCallback, useEffect, useMemo, useState } from 'react';
import { notificationsApi, type UserNotification } from '../services';
import './Notifications.css';

type NotificationTone = 'info' | 'warning' | 'success' | 'error';

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }
    if ('data' in error) {
      const data = (error as { data?: unknown }).data;
      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const detail = (data as { detail?: unknown }).detail;
        if (typeof detail === 'string') return detail;
      }
    }
  }
  return fallback;
};

const toneFromMessage = (message: string): NotificationTone => {
  if (/رد|باطل|خطا|نامعتبر|شکست/i.test(message)) return 'error';
  if (/در انتظار|نیازمند|پیگیری/i.test(message)) return 'warning';
  if (/تایید|موفق|ثبت شد|ارسال شد|ارسال به/i.test(message)) return 'success';
  return 'info';
};

const iconFromTone = (tone: NotificationTone): string => {
  switch (tone) {
    case 'success':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'error':
      return '❌';
    default:
      return '📢';
  }
};

const formatDate = (value: string): string =>
  new Date(value).toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const Notifications = () => {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await notificationsApi.list();
      setNotifications(rows);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'خطا در دریافت اعلان‌ها'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markOneAsRead = async (notificationId: number) => {
    try {
      setBusyId(notificationId);
      const updated = await notificationsApi.markRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? updated : item))
      );
    } catch (err) {
      setError(getErrorMessage(err, 'خطا در علامت‌گذاری اعلان'));
    } finally {
      setBusyId(null);
    }
  };

  const markAllAsRead = async () => {
    try {
      setMarkingAll(true);
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch (err) {
      setError(getErrorMessage(err, 'خطا در علامت‌گذاری همه اعلان‌ها'));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="notifications-page">
      <div className="notifications-header">
        <h1>🔔 اعلان‌ها</h1>
        <div className="notifications-header-actions">
          {unreadCount > 0 && <span className="unread-badge">{unreadCount} اعلان خوانده نشده</span>}
          <button
            type="button"
            className="mark-all-btn"
            onClick={markAllAsRead}
            disabled={markingAll || unreadCount === 0}
          >
            {markingAll ? 'در حال ثبت...' : 'خواندن همه'}
          </button>
        </div>
      </div>

      <div className="notifications-content">
        {error && <div className="notifications-error">{error}</div>}
        {loading ? (
          <div className="no-notifications">
            <div className="empty-icon">⏳</div>
            <h2>در حال دریافت اعلان‌ها...</h2>
          </div>
        ) : null}
        {!loading && notifications.length === 0 ? (
          <div className="no-notifications">
            <div className="empty-icon">🔕</div>
            <h2>اعلانی وجود ندارد</h2>
            <p>هیچ اعلان جدیدی برای نمایش وجود ندارد</p>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map((notification) => {
              const tone = toneFromMessage(notification.message);
              const title =
                notification.case_id !== null
                  ? `پرونده #${notification.case_id}${notification.case_title ? ` - ${notification.case_title}` : ''}`
                  : 'اعلان سیستم';
              return (
              <div
                key={notification.id}
                className={`notification-card ${tone} ${
                  notification.is_read ? 'read' : 'unread'
                }`}
              >
                <div className="notification-icon">
                  {iconFromTone(tone)}
                </div>
                <div className="notification-content">
                  <div className="notification-header-row">
                    <h3>{title}</h3>
                    <span className="notification-date">{formatDate(notification.created_at)}</span>
                  </div>
                  <p>{notification.message}</p>
                  {!notification.is_read && (
                    <span className="new-badge">جدید</span>
                  )}
                  {!notification.is_read && (
                    <button
                      type="button"
                      className="mark-read-btn"
                      onClick={() => markOneAsRead(notification.id)}
                      disabled={busyId === notification.id}
                    >
                      {busyId === notification.id ? '...' : 'علامت‌گذاری به‌عنوان خوانده‌شده'}
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}

        <div className="notifications-info">
          <div className="info-card">
            <h3>ℹ️ راهنما</h3>
            <p>اعلان‌های مربوط به روند پرونده‌ها، شکایات و تصمیمات نقش‌های بالاتر در این صفحه نمایش داده می‌شود.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
