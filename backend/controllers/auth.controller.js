const authService = require('../services/auth.service');

// Controllers: parse request -> call service -> send { status, body }. No logic.
const send = (res, { status, body }) => res.status(status).json(body);

const register = async (req, res, next) => {
  try {
    send(res, await authService.register(req.body ?? {}));
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    send(res, await authService.login(req.body ?? {}));
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    send(res, await authService.getStudent(req.studentId));
  } catch (err) {
    next(err);
  }
};

const adminLogin = async (req, res, next) => {
  try {
    send(res, await authService.adminLogin(req.body ?? {}));
  } catch (err) {
    next(err);
  }
};

const adminMe = async (req, res, next) => {
  try {
    send(res, await authService.getAdmin(req.adminId));
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, me, adminLogin, adminMe };
