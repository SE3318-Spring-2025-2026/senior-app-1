import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from '../../LoginPage.jsx';
import apiClient from '../../services/apiClient';

jest.mock('../../services/apiClient');

jest.mock('../../contexts/NotificationContext', () => ({
  useNotification: () => ({ notify: jest.fn() }),
  NotificationProvider: ({ children }) => children,
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn() }),
  AuthProvider: ({ children }) => children,
}));

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<div>Student Home</div>} />
        <Route path="/professors" element={<div>Professor Home</div>} />
        <Route path="/coordinator" element={<div>Coordinator Home</div>} />
        <Route path="/admin" element={<div>Admin Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeRejection(status, message) {
  const error = new Error(message || 'Request failed');
  error.response = { status, data: { message: message || 'Request failed' } };
  return error;
}

describe('Unified login page (issue #315)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  test('Login button is disabled until both fields are filled', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const submit = screen.getByRole('button', { name: /^login$/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Student ID or Email/i), 'something');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Password/i), 'pw');
    expect(submit).not.toBeDisabled();
  });

  test('rejects identifiers that are neither an 11-digit ID nor an email on submit', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/Student ID or Email/i), 'not-valid');
    await user.type(screen.getByLabelText(/Password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Invalid identifier/i })).toBeInTheDocument();
    });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('11-digit input dispatches to the student login endpoint and redirects to /home', async () => {
    const user = userEvent.setup();
    apiClient.post.mockResolvedValueOnce({
      data: {
        token: 'student-token',
        user: { role: 'STUDENT', studentId: '11070001000', fullName: 'Ada Lovelace' },
        message: 'Welcome',
      },
    });

    renderLoginPage();
    await user.type(screen.getByLabelText(/Student ID or Email/i), '11070001000');
    await user.type(screen.getByLabelText(/Password/i), 'pw-secret');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/v1/students/login', {
        studentId: '11070001000',
        password: 'pw-secret',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Student Home')).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('studentToken')).toBe('student-token');
    expect(window.localStorage.getItem('authToken')).toBe('student-token');
  });

  test('email input dispatches to professor endpoint first and redirects to /professors on success', async () => {
    const user = userEvent.setup();
    apiClient.post.mockResolvedValueOnce({
      data: {
        token: 'prof-token',
        user: { role: 'PROFESSOR', email: 'prof@example.edu' },
      },
    });

    renderLoginPage();
    await user.type(screen.getByLabelText(/Student ID or Email/i), 'prof@example.edu');
    await user.type(screen.getByLabelText(/Password/i), 'pw-secret');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/v1/professors/login', {
        email: 'prof@example.edu',
        password: 'pw-secret',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Professor Home')).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('professorToken')).toBe('prof-token');
  });

  test('email input falls through to coordinator endpoint after a 401 from professor', async () => {
    const user = userEvent.setup();
    apiClient.post
      .mockRejectedValueOnce(makeRejection(401, 'Invalid professor credentials'))
      .mockResolvedValueOnce({
        data: {
          token: 'coord-token',
          user: { role: 'COORDINATOR', email: 'coord@example.edu' },
        },
      });

    renderLoginPage();
    await user.type(screen.getByLabelText(/Student ID or Email/i), 'coord@example.edu');
    await user.type(screen.getByLabelText(/Password/i), 'pw-secret');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenNthCalledWith(1, '/v1/professors/login', expect.any(Object));
      expect(apiClient.post).toHaveBeenNthCalledWith(2, '/v1/coordinator/login', expect.any(Object));
    });
    await waitFor(() => {
      expect(screen.getByText('Coordinator Home')).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('coordinatorToken')).toBe('coord-token');
  });

  test('email input falls through to admin endpoint after professor + coordinator both 401', async () => {
    const user = userEvent.setup();
    apiClient.post
      .mockRejectedValueOnce(makeRejection(401))
      .mockRejectedValueOnce(makeRejection(401))
      .mockResolvedValueOnce({
        data: {
          token: 'admin-token',
          user: { role: 'ADMIN', email: 'admin@example.edu' },
        },
      });

    renderLoginPage();
    await user.type(screen.getByLabelText(/Student ID or Email/i), 'admin@example.edu');
    await user.type(screen.getByLabelText(/Password/i), 'pw-secret');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByText('Admin Home')).toBeInTheDocument();
    });
    expect(apiClient.post).toHaveBeenCalledTimes(3);
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/v1/admin/login', expect.any(Object));
    expect(window.localStorage.getItem('adminToken')).toBe('admin-token');
  });

  test('shows a clear failure message when all email-based endpoints reject the credentials', async () => {
    const user = userEvent.setup();
    apiClient.post
      .mockRejectedValueOnce(makeRejection(401))
      .mockRejectedValueOnce(makeRejection(401))
      .mockRejectedValueOnce(makeRejection(401, 'Invalid admin email or password.'));

    renderLoginPage();
    await user.type(screen.getByLabelText(/Student ID or Email/i), 'nobody@example.edu');
    await user.type(screen.getByLabelText(/Password/i), 'pw-wrong');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Login failed/i })).toBeInTheDocument();
    });
    expect(window.localStorage.getItem('authToken')).toBeNull();
  });
});
