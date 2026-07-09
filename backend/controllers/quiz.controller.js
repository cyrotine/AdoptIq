const quizService = require('../services/quiz.service');

const send = (res, { status, body }) => res.status(status).json(body);

const generate = async (req, res, next) => {
  try {
    send(res, await quizService.generate(req.studentId, req.body ?? {}));
  } catch (err) {
    next(err);
  }
};

const submit = async (req, res, next) => {
  try {
    send(res, await quizService.submit(req.studentId, req.body ?? {}));
  } catch (err) {
    next(err);
  }
};

const history = async (req, res, next) => {
  try {
    send(res, await quizService.listHistory(req.studentId));
  } catch (err) {
    next(err);
  }
};

const historyDetail = async (req, res, next) => {
  try {
    send(res, await quizService.getHistoryDetail(req.studentId, req.params.quizId));
  } catch (err) {
    next(err);
  }
};

module.exports = { generate, submit, history, historyDetail };
