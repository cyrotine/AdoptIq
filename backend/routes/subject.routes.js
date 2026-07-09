const router = require('express').Router();
const controller = require('../controllers/subject.controller');
const requireAuth = require('../middleware/auth.middleware');

router.get('/', requireAuth, controller.list);
router.get('/:subject_id/chapters', requireAuth, controller.listChapters);

module.exports = router;
