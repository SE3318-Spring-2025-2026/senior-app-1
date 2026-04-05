import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Register from './Register';
import AuthGuard from './components/AuthGuard';
import Chat from './components/Chat';
import AdminProfessorRegistration from './components/AdminProfessorRegistration';
import './styles.css';

function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p>Welcome, {user?.role}!</p>
      <button onClick={logout}>Logout</button>
      <Chat />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <AuthGuard allowedRoles={['student', 'coordinator', 'admin', 'professor']}>
                <Dashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/register-professor"
            element={
              <AuthGuard allowedRoles={['admin']}>
                <AdminProfessorRegistration />
              </AuthGuard>
            }
          />
          <Route path="/unauthorized" element={<div className="page"><h1>Unauthorized Access</h1><p>You do not have permission to access this page.</p></div>} />
          <Route path="/" element={<Login />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
