// GET /api/v1/user-database/students/:studentId/validation
const studentService = require('../services/studentService');

const checkStudentValidation = async (req, res) => {
  const { studentId } = req.params;
  if (!studentId || !/^[0-9]{11}$/.test(studentId)) {
    return res.status(400).json({ message: 'Invalid or missing studentId' });
  }

  // Check if studentId exists in valid registry
  const valid = await studentService.isStudentIdEligible(studentId);
  // Check if already registered
  const alreadyRegistered = await studentService.isStudentRegistered(studentId);

  return res.json({ valid, studentId, alreadyRegistered });
};
const { body, validationResult } = require('express-validator');
const professorService = require('../services/professorService');
const studentAccountService = require('../services/studentAccountService');
const studentService = require('../services/studentService');

function buildStudentAccountError(field) {
  switch (field) {
    case 'studentId':
      return { code: 'INVALID_STUDENT_ID', message: 'Student ID must be an 11-digit number.' };
    case 'email':
      return { code: 'INVALID_EMAIL', message: 'Email address is invalid.' };
    case 'fullName':
      return { code: 'INVALID_FULL_NAME', message: 'Full name must be at least 3 characters.' };
    case 'passwordHash':
      return {
        code: 'INVALID_PASSWORD_HASH',
        message: 'passwordHash is required.',
      };
    default:
      return { code: 'INVALID_CREATE_STUDENT_INPUT', message: 'Student account input is invalid.' };
  }
}

const createProfessorRecord = [
  body('email').isEmail().normalizeEmail(),
  body('fullName').notEmpty().trim(),
  body('department').notEmpty().trim(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_PROFESSOR_RECORD',
        message: 'Email, full name, and department are required.',
      });
    }

    const { email, fullName, department } = req.body;

    try {
      const result = await professorService.createProfessorRecord(
        email,
        fullName,
        department
      );

      return res.status(201).json(result);
    } catch (error) {
      if (error.code === 'DUPLICATE_EMAIL' || error.message === 'User with this email already exists') {
        return res.status(409).json({
          code: 'DUPLICATE_EMAIL',
          message: 'Email is already in use.',
        });
      }

      return res.status(500).json({
        code: 'PROFESSOR_RECORD_CREATE_FAILED',
        message: 'Professor record could not be created.',
      });
    }
  },
];

const createStudentRecord = [
  body('studentId').isString().trim().matches(/^[0-9]{11}$/),
  body('email').isEmail().normalizeEmail(),
  body('fullName').isString().trim().isLength({ min: 3 }),
  body('passwordHash').isString().trim().notEmpty(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const validationError = buildStudentAccountError(errors.array()[0].path);
      return res.status(400).json(validationError);
    }

    const { studentId, email, fullName, passwordHash } = req.body;

    if (await studentService.isStudentRegistered(studentId)) {
      return res.status(409).json({
        code: 'ALREADY_REGISTERED',
        message: 'Student is already registered.',
      });
    }

    if (await studentService.findStudentByEmail(email)) {
      return res.status(409).json({
        code: 'DUPLICATE_EMAIL',
        message: 'Email is already in use.',
      });
    }

    const student = await studentAccountService.createStudentAccountRecord({
      studentId,
      email,
      fullName,
      passwordHash,
    });

    return res.status(201).json({
      userId: student.id,
      studentId: student.studentId,
      message: 'Student account created successfully',
    });
  },
];


const ValidStudentId = require('../models/ValidStudentId');

// POST /api/v1/user-database/valid-student-ids
const storeValidStudentIds = async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds)) {
    return res.status(400).json({ message: 'studentIds must be an array.' });
  }

  let inserted = 0;
  let duplicates = 0;
  let invalidFormat = 0;

  // Validate and deduplicate input
  const seen = new Set();
  const validFormatIds = [];
  for (const id of studentIds) {
    if (!/^[0-9]{11}$/.test(id)) {
      invalidFormat++;
      continue;
    }
    if (seen.has(id)) continue; // skip duplicates in input
    seen.add(id);
    validFormatIds.push(id);
  }

  // Check which IDs already exist
  const existing = await ValidStudentId.findAll({
    where: { studentId: validFormatIds },
    attributes: ['studentId'],
    raw: true,
  });
  const existingSet = new Set(existing.map(e => e.studentId));

  const toInsert = validFormatIds.filter(id => !existingSet.has(id));
  duplicates = validFormatIds.length - toInsert.length;

  // Bulk insert new IDs
  if (toInsert.length > 0) {
    await ValidStudentId.bulkCreate(
      toInsert.map(studentId => ({ studentId })),
      { ignoreDuplicates: true }
    );
    inserted = toInsert.length;
  }

  return res.json({ inserted, duplicates, invalidFormat });
};

module.exports = {
  createProfessorRecord,
  createStudentRecord,
  storeValidStudentIds,
  checkStudentValidation,
};
