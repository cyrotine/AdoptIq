// Spec 11 — create the admin account. The only way an admin comes into
// existence (no signup endpoint). Usage:
//   node backend/scripts/createAdmin.js --username <u> --password <p>
const bcrypt = require('bcryptjs');
const supabase = require('../../db/supabase');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

(async () => {
  const username = arg('username');
  const password = arg('password');

  if (!username || !password) {
    console.error('Usage: node backend/scripts/createAdmin.js --username <u> --password <p>');
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('admins')
    .insert({ username, password_hash })
    .select('admin_id, username')
    .single();

  if (error) {
    if (error.code === '23505') console.error(`Admin "${username}" already exists.`);
    else console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log('Created admin:', data);
})();
