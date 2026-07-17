const bcrypt = require('bcryptjs');
const supabase = require('../../db/supabase');
const jwt = require('../utils/jwt');
const { validateRegistration, validateLogin } = require('../utils/validate');

// Columns safe to send for an admin — never password_hash.
const ADMIN_SAFE_COLUMNS = 'admin_id, username';

// Only columns safe to send to the client — never password_hash.
const SAFE_COLUMNS =
  'student_id, name, username, email, class, total_quizzes, correct_answers';

// Service results are { status, body } — controllers just forward them.
const ok = (status, body) => ({ status, body });
const fail = (status, message) => ({ status, body: { error: message } });

const register = async (input) => {
  const invalid = validateRegistration(input);
  if (invalid) return fail(400, invalid);

  const password_hash = await bcrypt.hash(input.password, 10);

  const { data: student, error } = await supabase
    .from('students')
    .insert({
      name: input.name.trim(),
      username: input.username,
      email: input.email.toLowerCase(),
      password_hash,
      class: input.class,
    })
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') return fail(409, 'username or email already taken');
    throw new Error(`register failed: ${error.message}`);
  }

  return ok(201, { token: jwt.sign(student.student_id), student });
};

const login = async (input) => {
  const invalid = validateLogin(input);
  if (invalid) return fail(400, invalid);

  const identifier = input.identifier.trim();
  const { data: rows, error } = await supabase
    .from('students')
    .select(`${SAFE_COLUMNS}, password_hash`)
    .or(`username.eq.${identifier},email.eq.${identifier.toLowerCase()}`)
    .limit(1);

  if (error) throw new Error(`login lookup failed: ${error.message}`);

  // Same message for unknown user and wrong password — no enumeration.
  const row = rows[0];
  if (!row || !(await bcrypt.compare(input.password, row.password_hash))) {
    return fail(401, 'invalid credentials');
  }

  const { password_hash, ...student } = row;
  return ok(200, { token: jwt.sign(student.student_id), student });
};

const getStudent = async (studentId) => {
  const { data: student, error } = await supabase
    .from('students')
    .select(SAFE_COLUMNS)
    .eq('student_id', studentId)
    .maybeSingle();

  if (error) throw new Error(`student lookup failed: ${error.message}`);
  if (!student) return fail(401, 'invalid token');

  return ok(200, { student });
};

// Spec 11. Admin login is separate from student login: distinct table, and the
// issued token carries role 'admin'. Same no-enumeration contract as login().
const adminLogin = async (input) => {
  const invalid = validateLogin({ identifier: input.username, password: input.password });
  if (invalid) return fail(400, invalid);

  const username = input.username.trim();
  const { data: rows, error } = await supabase
    .from('admins')
    .select(`${ADMIN_SAFE_COLUMNS}, password_hash`)
    .eq('username', username)
    .limit(1);

  if (error) throw new Error(`admin login lookup failed: ${error.message}`);

  const row = rows[0];
  if (!row || !(await bcrypt.compare(input.password, row.password_hash))) {
    return fail(401, 'invalid credentials');
  }

  const { password_hash, ...admin } = row;
  return ok(200, { token: jwt.sign(admin.admin_id, 'admin'), admin });
};

const getAdmin = async (adminId) => {
  const { data: admin, error } = await supabase
    .from('admins')
    .select(ADMIN_SAFE_COLUMNS)
    .eq('admin_id', adminId)
    .maybeSingle();

  if (error) throw new Error(`admin lookup failed: ${error.message}`);
  if (!admin) return fail(401, 'invalid token');

  return ok(200, { admin });
};

module.exports = { register, login, getStudent, adminLogin, getAdmin };
