const { body, param, validationResult } = require('express-validator');

const STORAGE_TIMEOUT_MS = 5000;

/**
 * Wraps the DB persist in a timeout to handle network/storage latency gracefully.
 * Acceptance criteria: D5 storage functions handle network latency gracefully using timeouts.
 */
function withTimeout(promise, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => {
      const err = new Error('Document storage timed out.');
      err.code = 'STORAGE_TIMEOUT';
      reject(err);
    }, ms)
  );
  return Promise.race([promise, timeout]);
}

exports.submitDeliverableValidation = [
  param('groupId').isString().trim().notEmpty().withMessage('Group ID is required'),
  body('markdownContent').optional().isString(),
  body('imageUrls').optional().isArray(),
  body('imageUrls.*').optional().isURL().withMessage('Each imageUrl must be a valid URL'),
];

/**
 * POST /api/v1/groups/:groupId/deliverables
 * Extracts markdown content and image URLs from payload,
 * persists to D5 Document Storage, returns unique documentRef.
 */
exports.submitDeliverable = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'INVALID_DELIVERABLE_INPUT',
      message: 'Deliverable payload failed validation.',
      errors: errors.array(),
    });
  }

  try {
    const { groupId } = req.params;
    const { markdownContent, imageUrls } = req.body;

    const deliverable = await withTimeout(
      req.app.locals.models.GroupDeliverable.create({
        groupId,
        markdownContent: markdownContent ?? null,
        imageUrls: imageUrls ?? [],
      }),
      STORAGE_TIMEOUT_MS
    );

    return res.status(201).json({
      code: 'SUCCESS',
      message: 'Deliverable stored successfully.',
      data: {
        documentRef: deliverable.documentRef,
        groupId: deliverable.groupId,
        createdAt: deliverable.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 'STORAGE_TIMEOUT') {
      console.error('D5 storage timeout:', error);
      return res.status(500).json({
        code: 'STORAGE_TIMEOUT',
        message: 'Document storage timed out. Please try again.',
      });
    }

    console.error('Error in submitDeliverable:', error);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};