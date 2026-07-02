const supabase = require('./supabase');

(async () => {
  const { data, error } = await supabase.from('subjects').select('*');

  console.log("DATA:", data);
  console.log("ERROR:", error);
})();