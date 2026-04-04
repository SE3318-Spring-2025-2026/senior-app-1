class StudentRegistrationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'StudentRegistrationError';
    this.status = status;
    this.code = code;
  }
}

module.exports = StudentRegistrationError;
