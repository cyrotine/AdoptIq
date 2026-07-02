// Field validators. Each returns an error message string, or null if valid.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

const validateRegistration = ({ name, username, email, password, class: cls }) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 100)
    return 'name is required (max 100 characters)';
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    return 'username must be 3-30 characters (letters, numbers, underscore)';
  if (typeof email !== 'string' || email.length > 100 || !EMAIL_RE.test(email))
    return 'a valid email is required (max 100 characters)';
  if (typeof password !== 'string' || password.length < 8)
    return 'password must be at least 8 characters';
  if (!Number.isInteger(cls) || ![9, 10].includes(cls))
    return 'class must be 9 or 10';
  return null;
};

const validateLogin = ({ identifier, password }) => {
  if (typeof identifier !== 'string' || !identifier.trim())
    return 'identifier (username or email) is required';
  if (typeof password !== 'string' || !password)
    return 'password is required';
  return null;
};

module.exports = { validateRegistration, validateLogin };
