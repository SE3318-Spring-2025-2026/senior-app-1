const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ValidStudentId = require('../models/ValidStudentId');

const DEFAULT_VALID_STUDENT_IDS = ['11070001000', '11070001001', '11070001002'];
const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function normalizeEmail(email) {
  // Normalized emails make duplicate checks deterministic regardless of casing.
  return email.trim().toLowerCase();
}

function validateStudentIdFormat(studentId) {
  return /^[0-9]{11}$/.test(studentId);
}

function validatePasswordStrength(password) {
  return PASSWORD_POLICY_REGEX.test(password);
}

async function ensureValidStudentRegistry() {
  // Seed a baseline registry so registration business rules work even before
  // coordinators upload a larger batch of valid IDs.
  const configuredIds = process.env.VALID_STUDENT_IDS
    ? process.env.VALID_STUDENT_IDS.split(',').map((item) => item.trim()).filter(Boolean)
    : DEFAULT_VALID_STUDENT_IDS;

  await ValidStudentId.bulkCreate(
    configuredIds.map((studentId) => ({ studentId })),
    { ignoreDuplicates: true },
  );
}

async function isStudentIdEligible(studentId) {
  const validStudentId = await ValidStudentId.findByPk(studentId);
  return Boolean(validStudentId);
}

async function bulkStoreValidStudentIds(studentIds) {
  const normalizedIds = Array.isArray(studentIds) ? studentIds.map((studentId) => String(studentId).trim()) : [];
  const validIds = [];
  let invalidFormatCount = 0;

  for (const studentId of normalizedIds) {
    if (!validateStudentIdFormat(studentId)) {
      invalidFormatCount += 1;
      continue;
    }

    validIds.push(studentId);
  }

  const uniqueValidIds = [...new Set(validIds)];
  const existingRecords = uniqueValidIds.length > 0
    ? await ValidStudentId.findAll({ where: { studentId: uniqueValidIds } })
    : [];
  const existingIds = new Set(existingRecords.map((record) => record.studentId));
  const idsToInsert = uniqueValidIds.filter((studentId) => !existingIds.has(studentId));

  if (idsToInsert.length > 0) {
    await ValidStudentId.bulkCreate(
      idsToInsert.map((studentId) => ({ studentId })),
      { ignoreDuplicates: true },
    );
  }

  return {
    insertedCount: idsToInsert.length,
    duplicateCount: validIds.length - idsToInsert.length,
    invalidFormatCount,
  };
}

async function isStudentRegistered(studentId) {
  const student = await User.findOne({
    where: {
      studentId,
      role: 'STUDENT',
    },
  });

  return Boolean(student);
}

async function findStudentByEmail(email) {
  return User.findOne({ where: { email: normalizeEmail(email) } });
}

async function getStudentByStudentId(studentId) {
  return User.findOne({
    where: {
      studentId,
      role: 'STUDENT',
    },
  });
}

async function createStudent({ studentId, email, fullName, password }) {
  return User.create({
    studentId,
    email: normalizeEmail(email),
    fullName: fullName.trim(),
    // Passwords are never stored directly; only the bcrypt hash is persisted.
    passwordHash: await bcrypt.hash(password, 10),
    role: 'STUDENT',
    status: 'ACTIVE',
  });
}

async function updateStudentGitHubLink(studentId, githubUsername, githubLinked) {
  const student = await getStudentByStudentId(studentId);
  if (!student) {
    return null;
  }

  // These fields mirror the linked-account state in the main user record so the
  // application can answer simple "is GitHub linked?" questions quickly.
  student.githubUsername = githubUsername;
  student.githubLinked = githubLinked;
  await student.save();
  return student;
}

module.exports = {
  bulkStoreValidStudentIds,
  createStudent,
  ensureValidStudentRegistry,
  findStudentByEmail,
  getStudentByStudentId,
  isStudentIdEligible,
  isStudentRegistered,
  normalizeEmail,
  updateStudentGitHubLink,
  validatePasswordStrength,
  validateStudentIdFormat,
};
