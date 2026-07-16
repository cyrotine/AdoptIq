const router = require('express').Router();
const controller = require('../controllers/mastery.controller');
const requireAuth = require('../middleware/auth.middleware');

router.post('/baseline', requireAuth, controller.baseline);

module.exports = router;
