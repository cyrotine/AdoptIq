const supabase = require('./supabase');

(async () => {
  const { error } = await supabase.from('subjects').select('subject_id').limit(1);
  if (error) {
    console.error('Connection failed:', error.message);
    process.exit(1);
  }
  console.log('Connected to Supabase OK');
})();