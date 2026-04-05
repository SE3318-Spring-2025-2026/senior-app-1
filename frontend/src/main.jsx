import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import CoordinatorStudentIdUpload from './CoordinatorStudentIdUpload';
import Layout from './Layout';
import { NotificationProvider } from './NotificationContext';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <NotificationProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<App />} />
          <Route path="coordinator/upload" element={<CoordinatorStudentIdUpload />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </NotificationProvider>
);