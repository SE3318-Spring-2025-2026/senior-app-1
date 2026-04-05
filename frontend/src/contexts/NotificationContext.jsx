import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const timeoutIds = useRef(new Map());

  useEffect(() => () => {
    timeoutIds.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIds.current.clear();
  }, []);

  function dismiss(id) {
    const timeoutId = timeoutIds.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutIds.current.delete(id);
    }

    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }

  function notify({ type = 'info', title, message }) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const notification = { id, type, title, message };
    setNotifications((current) => [notification, ...current].slice(0, 3));

    const timeoutId = window.setTimeout(() => dismiss(id), 4500);
    timeoutIds.current.set(id, timeoutId);

    return id;
  }

  const value = useMemo(
    () => ({
      notifications,
      notify,
      dismiss,
    }),
    [notifications],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }

  return context;
}
