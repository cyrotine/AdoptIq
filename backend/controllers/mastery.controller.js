const masteryService = require('../services/mastery.service');

const send = (res, { status, body }) => res.status(status).json(body);

const baseline = async (req, res, next) => {
  try {
    send(res, await masteryService.seedBaseline(req.studentId, req.body ?? {}));
  } catch (err) {
    next(err);
  }
};

module.exports = { baseline };
