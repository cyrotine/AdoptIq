const os = require('os');
const path = require('path');
const multer = require('multer');
const router = require('express').Router();
const controller = require('../controllers/session.controller');
const { requireAdmin } = require('../middleware/auth.middleware');

const ALLOWED = ['.pdf', '.txt', '.md'];

// Temp upload into the OS scratch dir, preserving the extension so extractText
// dispatches correctly. The controller unlinks the file after processing.
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  // Silently drop a bad extension -> req.file undefined -> controller 400.
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase())),
});

router.post('/', requireAdmin, upload.single('file'), controller.create);
router.get('/:id', requireAdmin, controller.get);
router.post('/:id/finish', requireAdmin, controller.finish);

module.exports = router;
