const finalEvaluationService = require('../services/finalEvaluationService');

async function myGrade(req, res, next) {
  try {
    const view = await finalEvaluationService.getMyGrade(req.user);
    return res.status(200).json(view);
  } catch (err) {
    return next(err);
  }
}

module.exports = { myGrade };
