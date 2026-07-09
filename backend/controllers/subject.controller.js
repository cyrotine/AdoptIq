const subjectService = require('../services/subject.service');

const send = (res, { status, body }) => res.status(status).json(body);

const list = async (req, res, next) => {
  try {
    send(res, await subjectService.listSubjects());
  } catch (err) {
    next(err);
  }
};

const listChapters = async (req, res, next) => {
  try {
    send(res, await subjectService.listChapters(req.studentId, Number(req.params.subject_id)));
  } catch (err) {
    next(err);
  }
};

module.exports = { list, listChapters };
