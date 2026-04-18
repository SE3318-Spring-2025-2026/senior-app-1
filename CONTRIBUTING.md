# Contributing to Senior App

Thank you for your interest in contributing to the Senior App project! This document provides guidelines and information for contributors.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)
- **Git**

### Project Structure

This project consists of two main parts:

- **Backend**: Express.js API server with SQLite database
- **Frontend**: React application built with Vite

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/SE3318-Spring-2025-2026/senior-app-1.git
   cd senior-app-1
   ```

2. **Install dependencies:**
   ```bash
   # Install root dependencies
   npm install

   # Install backend dependencies
   cd backend
   npm install
   cd ..

   # Install frontend dependencies
   cd frontend
   npm install
   cd ..
   ```

3. **Set up environment variables:**

   Create a `.env` file in the `backend` directory with the following variables:
   ```
   JWT_SECRET=your-secret-key-here
   NODE_ENV=development
   ```

4. **Start the development servers:**
   ```bash
   # Start both backend and frontend
   npm run dev

   # Or start them separately:
   # Backend only
   npm run dev:backend

   # Frontend only
   npm run dev:frontend
   ```

5. **Verify setup:**
   - Backend API should be running on `http://localhost:3000`
   - Frontend should be running on `http://localhost:5173`

## Development Workflow

### Branching Strategy

- `main`: Production-ready code
- `feature/*`: New features
- `bugfix/*`: Bug fixes
- `hotfix/*`: Critical fixes for production

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Testing
- `chore`: Maintenance

Examples:
```
feat(auth): add JWT token validation
fix(api): resolve user registration endpoint error
docs(readme): update installation instructions
```

### Code Standards

#### Backend (Node.js/Express)

- Use ES6+ syntax
- Follow [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- Use meaningful variable and function names
- Add JSDoc comments for functions
- Handle errors appropriately
- Use async/await for asynchronous operations

#### Frontend (React)

- Use functional components with hooks
- Follow React best practices
- Use meaningful component and variable names
- Implement proper error boundaries
- Use TypeScript for type safety (when applicable)

#### General

- Write self-documenting code
- Keep functions small and focused
- Use consistent naming conventions
- Remove unused code and dependencies

## Testing

### Backend Tests

Run backend tests:
```bash
cd backend
npm test
```

Test files are located in `backend/test/` directory.

### Frontend Tests

Run frontend tests:
```bash
cd frontend
npm test
```

### Test Coverage

- Write unit tests for new functions
- Write integration tests for API endpoints
- Ensure all tests pass before submitting PR

## Submitting Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes:**
   - Follow code standards
   - Write tests for new functionality
   - Update documentation if needed

3. **Run tests:**
   ```bash
   npm test
   ```

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request:**
   - Go to the GitHub repository
   - Click "New Pull Request"
   - Select your feature branch
   - Fill out the PR template
   - Request review from maintainers

### Pull Request Guidelines

- Provide a clear description of changes
- Reference related issues
- Include screenshots for UI changes
- Ensure CI checks pass
- Request review from appropriate team members

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Description**: Clear description of the issue
- **Steps to reproduce**: Step-by-step instructions
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: OS, browser, Node.js version
- **Screenshots**: If applicable

### Feature Requests

For feature requests, please include:

- **Description**: What feature you want
- **Use case**: Why this feature is needed
- **Implementation ideas**: If you have any suggestions

### Issue Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Documentation improvements
- `question`: Further information needed
- `help wanted`: Extra attention needed

## Code of Conduct

This project follows a code of conduct to ensure a welcoming environment for all contributors. Please be respectful and constructive in all interactions.

## License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Senior App! 🚀