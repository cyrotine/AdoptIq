const adminService = require('../services/admin.service');

const send = (res, { status, body }) => res.status(status).json(body);

const topicStats = async (req, res, next) => {
  try {
    send(res, await adminService.topicAskCounts());
  } catch (err) {
    next(err);
  }
};

module.exports = { topicStats };
