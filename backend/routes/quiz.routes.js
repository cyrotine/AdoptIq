const router = require('express').Router();
const controller = require('../controllers/quiz.controller');
const requireAuth = require('../middleware/auth.middleware');

router.post('/generate', requireAuth, controller.generate);
router.post('/submit', requireAuth, controller.submit);
router.get('/history', requireAuth, controller.history);
router.get('/history/:quizId', requireAuth, controller.historyDetail);

module.exports = router;
