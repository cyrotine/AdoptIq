const router = require('express').Router();
const controller = require('../controllers/admin.controller');
const { requireAdmin } = require('../middleware/auth.middleware');

router.get('/topic-stats', requireAdmin, controller.topicStats);

module.exports = router;
