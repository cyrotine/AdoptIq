const fs = require('fs');
const sessionService = require('../services/session.service');
const { validateSessionCreate, validateGenerateMore, validateChatMessages } = require('../utils/validate');

const send = (res, { status, body }) => res.status(status).json(body);

const create = async (req, res, next) => {
  try {
    // multer drops a missing/bad-extension file, leaving req.file undefined.
    if (!req.file) return send(res, { status: 400, body: { error: 'file (.pdf, .txt, or .md) is required' } });

    // Multipart fields arrive as strings; parse to Number so the integer
    // validators bite (Number('') === 0 and Number('x') === NaN both fail them).
    const topicId = Number(req.body.topic_id);
    const targetElo = Number(req.body.target_elo);
    const count = Number(req.body.count);

    const bad = validateSessionCreate({ topic_id: topicId, target_elo: targetElo, count });
    if (bad) return send(res, { status: 400, body: { error: bad } });

    send(res, await sessionService.createSession({
      adminId: req.adminId, topicId, targetElo, count, filePath: req.file.path,
    }));
  } catch (err) {
    next(err);
  } finally {
    // The upload never persists on disk.
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
  }
};

const get = async (req, res, next) => {
  try {
    send(res, await sessionService.getSession(req.params.id));
  } catch (err) {
    next(err);
  }
};

const finish = async (req, res, next) => {
  try {
    send(res, await sessionService.finishSession(req.params.id));
  } catch (err) {
    next(err);
  }
};

// Accept a candidate: the full candidate is the JSON body; the service
// re-validates it (trust boundary) and takes topic_id from the session.
const accept = async (req, res, next) => {
  try {
    send(res, await sessionService.acceptQuestion(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
};

// Spec 15 — another batch on an active session. JSON body (no multer).
const generateMore = async (req, res, next) => {
  try {
    const count = Number(req.body.count);
    const targetElo = req.body.target_elo === undefined ? undefined : Number(req.body.target_elo);
    const bad = validateGenerateMore({ count, target_elo: targetElo });
    if (bad) return send(res, { status: 400, body: { error: bad } });
    send(res, await sessionService.generateMore(req.params.id, { count, targetElo }));
  } catch (err) {
    next(err);
  }
};

// Spec 15 — grounded chat turn. The transient conversation is the JSON body.
const chat = async (req, res, next) => {
  try {
    const bad = validateChatMessages(req.body.messages);
    if (bad) return send(res, { status: 400, body: { error: bad } });
    send(res, await sessionService.chat(req.params.id, req.body.messages));
  } catch (err) {
    next(err);
  }
};

module.exports = { create, get, finish, accept, generateMore, chat };
