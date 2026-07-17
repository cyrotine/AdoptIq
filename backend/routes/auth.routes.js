const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const requireAuth = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/auth.middleware');

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', requireAuth, controller.me);

// Spec 11 — admin auth, separate from student auth.
router.post('/admin/login', controller.adminLogin);
router.get('/admin/me', requireAdmin, controller.adminMe);

module.exports = router;
