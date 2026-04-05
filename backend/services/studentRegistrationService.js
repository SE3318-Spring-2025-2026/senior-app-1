const StudentRegistrationError = require('../errors/studentRegistrationError');
const studentService = require('./studentService');

async function validateRegistrationDetails({ studentId, email, fullName, password }) {
  if (!studentService.validateStudentIdFormat(studentId)) {
    throw new StudentRegistrationError(
      400,
      'INVALID_STUDENT_ID',
      'Student ID must be an 11-digit number.',
    );
  }

  if (!(await studentService.isStudentIdEligible(studentId))) {
    throw new StudentRegistrationError(
      403,
      'STUDENT_NOT_ELIGIBLE',
      'Student ID is not eligible for registration.',
    );
  }

  if (await studentService.isStudentRegistered(studentId)) {
    throw new StudentRegistrationError(
      409,
      'ALREADY_REGISTERED',
      'Student is already registered.',
    );
  }

  if (await studentService.findStudentByEmail(email)) {
    throw new StudentRegistrationError(
      409,
      'DUPLICATE_EMAIL',
      'Email is already in use.',
    );
  }

  if (!studentService.validatePasswordStrength(password)) {
    throw new StudentRegistrationError(
      400,
      'WEAK_PASSWORD',
      'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.',
    );
  }

  return {
    studentId,
    email: studentService.normalizeEmail(email),
    fullName: fullName.trim(),
    password,
  };
}

async function validateAndCreateStudent(registrationDetails) {
  const validatedRegistration = await validateRegistrationDetails(registrationDetails);
  return studentService.createStudent(validatedRegistration);
}

module.exports = {
  validateAndCreateStudent,
  validateRegistrationDetails,
};
