import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminProfessorRegistration from '../AdminProfessorRegistration';
import apiClient from '../../services/apiClient';

// Mock the apiClient
jest.mock('../../services/apiClient');
const mockApiClient = apiClient;

describe('AdminProfessorRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient.post.mockReset();
  });

  test('renders the registration form correctly', () => {
    render(<AdminProfessorRegistration />);

    // Check main heading
    expect(screen.getByRole('heading', { name: 'Register Professor' })).toBeInTheDocument();
    
    // Check form fields with exact labels
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
    
    // Check submit button
    expect(screen.getByRole('button', { name: 'Register Professor' })).toBeInTheDocument();
    
    // Check placeholders
    expect(screen.getByPlaceholderText('professor@university.edu')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Prof. Ali Veli')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Computer Engineering')).toBeInTheDocument();
    
    // Check required attributes
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Full Name')).toBeRequired();
    expect(screen.getByLabelText('Department')).toBeRequired();
  });

  test('displays initial feedback message', () => {
    render(<AdminProfessorRegistration />);

    expect(screen.getByText('Current Status')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waiting for input' })).toBeInTheDocument();
    expect(screen.getByText('Submit the professor registration form.')).toBeInTheDocument();
    
    // Check aria-live for accessibility
    const feedbackSection = screen.getByText('Current Status').closest('section');
    expect(feedbackSection).toHaveAttribute('aria-live', 'polite');
  });

  test('updates form fields when user types', async () => {
    const user = userEvent.setup();
    render(<AdminProfessorRegistration />);

    const emailInput = screen.getByLabelText('Email');
    const nameInput = screen.getByLabelText('Full Name');
    const departmentInput = screen.getByLabelText('Department');

    await user.type(emailInput, 'professor@university.edu');
    await user.type(nameInput, 'Prof. Ali Veli');
    await user.type(departmentInput, 'Computer Engineering');

    expect(emailInput.value).toBe('professor@university.edu');
    expect(nameInput.value).toBe('Prof. Ali Veli');
    expect(departmentInput.value).toBe('Computer Engineering');
  });

  test('submits form successfully', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      data: {
        userId: '123',
        professorId: '456',
        message: 'Professor registered successfully'
      }
    };
    mockApiClient.post.mockResolvedValueOnce(mockResponse);

    render(<AdminProfessorRegistration />);

    const emailInput = screen.getByLabelText('Email');
    const nameInput = screen.getByLabelText('Full Name');
    const departmentInput = screen.getByLabelText('Department');
    const submitButton = screen.getByRole('button', { name: 'Register Professor' });

    await user.type(emailInput, 'professor@university.edu');
    await user.type(nameInput, 'Prof. Ali Veli');
    await user.type(departmentInput, 'Computer Engineering');
    await user.click(submitButton);

    expect(mockApiClient.post).toHaveBeenCalledWith('/v1/admin/professors', {
      email: 'professor@university.edu',
      fullName: 'Prof. Ali Veli',
      department: 'Computer Engineering'
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Professor registered successfully' })).toBeInTheDocument();
    });

    expect(screen.getByText('123')).toBeInTheDocument(); // userId
    expect(screen.getByText('456')).toBeInTheDocument(); // professorId
    expect(screen.getByText('Created')).toBeInTheDocument(); // result
  });

  test('handles submission error', async () => {
    const user = userEvent.setup();
    const mockError = {
      response: {
        data: {
          message: 'Email already exists'
        }
      }
    };
    mockApiClient.post.mockRejectedValueOnce(mockError);

    render(<AdminProfessorRegistration />);

    const emailInput = screen.getByLabelText(/email/i);
    const nameInput = screen.getByLabelText(/full name/i);
    const departmentInput = screen.getByLabelText(/department/i);
    const submitButton = screen.getByRole('button', { name: /register professor/i });

    await user.type(emailInput, 'existing@university.edu');
    await user.type(nameInput, 'Prof. Ali Veli');
    await user.type(departmentInput, 'Computer Engineering');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Registration failed' })).toBeInTheDocument();
    });

    expect(screen.getByText('Email already exists')).toBeInTheDocument();
  });

  test('disables submit button while submitting', async () => {
    const user = userEvent.setup();
    mockApiClient.post.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<AdminProfessorRegistration />);

    const emailInput = screen.getByLabelText(/email/i);
    const nameInput = screen.getByLabelText(/full name/i);
    const departmentInput = screen.getByLabelText(/department/i);
    const submitButton = screen.getByRole('button', { name: /register professor/i });

    await user.type(emailInput, 'professor@university.edu');
    await user.type(nameInput, 'Prof. Ali Veli');
    await user.type(departmentInput, 'Computer Engineering');
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Registering...' })).toBeInTheDocument();
  });

  test('resets form after successful submission', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      data: {
        userId: '123',
        professorId: '456',
        message: 'Professor registered successfully'
      }
    };
    mockApiClient.post.mockResolvedValueOnce(mockResponse);

    render(<AdminProfessorRegistration />);

    const emailInput = screen.getByLabelText('Email');
    const nameInput = screen.getByLabelText('Full Name');
    const departmentInput = screen.getByLabelText('Department');
    const submitButton = screen.getByRole('button', { name: 'Register Professor' });

    await user.type(emailInput, 'professor@university.edu');
    await user.type(nameInput, 'Prof. Ali Veli');
    await user.type(departmentInput, 'Computer Engineering');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Professor registered successfully' })).toBeInTheDocument();
    });

    expect(emailInput.value).toBe('');
    expect(nameInput.value).toBe('');
    expect(departmentInput.value).toBe('');
  });
});