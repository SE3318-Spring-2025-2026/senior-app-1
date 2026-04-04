const { body, param, validationResult } = require('express-validator');
const professorService = require('../services/professorService');

const updateProfessorPassword = [
  param('professorId').isInt({ min: 1 }).toInt(),
  body('passwordHash').isString().trim().notEmpty(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Invalid request body',
      });
    }

    const { professorId } = req.params;
    const { passwordHash } = req.body;

    try {
      const result = await professorService.updateProfessorPassword(
        Number(professorId),
        passwordHash
      );

      return res.status(200).json(result);
    } catch (error) {
      if (error.message === 'PROFESSOR_NOT_FOUND') {
        return res.status(404).json({
          message: 'Professor not found',
        });
      }

      return res.status(500).json({
        message: 'Internal Server Error',
      });
    }
  },
];

module.exports = { updateProfessorPassword };
