import React, { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext();

export function useNotification() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((type, message, options = {}) => {
    setNotification({ type, message, ...options });
    if (!options.persistent) {
      setTimeout(() => setNotification(null), options.duration || 3500);
    }
  }, []);

  const hideNotification = useCallback(() => setNotification(null), []);

  return (
    <NotificationContext.Provider value={{ showNotification, hideNotification }}>
      {children}
      {notification && (
        <div className={`notification notification-${notification.type}`}> 
          <span>{notification.message}</span>
          <button className="notification-close" onClick={hideNotification}>&times;</button>
        </div>
      )}
    </NotificationContext.Provider>
  );
}
