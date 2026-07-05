const subjectService = require('../services/subject.service');

const send = (res, { status, body }) => res.status(status).json(body);

const list = async (req, res, next) => {
  try {
    send(res, await subjectService.listSubjects());
  } catch (err) {
    next(err);
  }
};

module.exports = { list };
