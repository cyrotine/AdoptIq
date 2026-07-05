const router = require('express').Router();
const controller = require('../controllers/subject.controller');
const requireAuth = require('../middleware/auth.middleware');

router.get('/', requireAuth, controller.list);

module.exports = router;
