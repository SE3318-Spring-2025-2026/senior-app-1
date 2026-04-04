const { body, validationResult } = require('express-validator');
const professorService = require('../services/professorService');

const verifySetupToken = [
  body('setupToken').isString().trim().notEmpty(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        valid: false,
        message: 'Invalid request body',
      });
    }

    const { setupToken } = req.body;

    try {
      const result = await professorService.verifySetupToken(setupToken);

      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({
        valid: false,
        message: 'Internal Server Error',
      });
    }
  },
];

module.exports = { verifySetupToken };
