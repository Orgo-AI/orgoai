module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(200).json({ isPro: false }); return; }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: { user } } = await supa.auth.getUser(token);
    if (!user) { res.status(200).json({ isPro: false }); return; }
    const { data: profile } = await supa.from('profiles').select('is_pro').eq('id', user.id).single();
    res.status(200).json({ isPro: profile?.is_pro || false });
  } catch(e) {
    res.status(200).json({ isPro: false });
  }
};
