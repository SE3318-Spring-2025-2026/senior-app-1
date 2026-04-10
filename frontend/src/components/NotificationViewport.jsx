import { useNotification } from '../contexts/NotificationContext';

export default function NotificationViewport() {
  const { notifications, dismiss } = useNotification();

  return (
    <div className="notification-stack" aria-live="polite" aria-atomic="true">
      {notifications.map((notification) => (
        <section
          key={notification.id}
          className={`notification notification-${notification.type}`}
        >
          <div>
            <p className="notification-title">{notification.title}</p>
            {notification.message && <p className="notification-message">{notification.message}</p>}
          </div>
          <button
            type="button"
            className="notification-close"
            onClick={() => dismiss(notification.id)}
            aria-label="Dismiss notification"
          >
            Close
          </button>
        </section>
      ))}
    </div>
  );
}
