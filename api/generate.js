const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Check usage via Supabase if token provided
  const token = req.headers.authorization?.replace('Bearer ', '');
  let isPro = false;
  let usageCount = 0;
  let userId = null;

  if (token && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: { user } } = await supa.auth.getUser(token);
      if (user) {
        userId = user.id;
        const { data: profile } = await supa.from('profiles').select('is_pro, usage_count, usage_reset').eq('id', userId).single();
        if (profile) {
          isPro = profile.is_pro || false;
          // Reset monthly usage if needed
          const resetDate = new Date(profile.usage_reset || 0);
          const now = new Date();
          if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
            await supa.from('profiles').update({ usage_count: 0, usage_reset: now.toISOString() }).eq('id', userId);
            usageCount = 0;
          } else {
            usageCount = profile.usage_count || 0;
          }
        }
      }
    } catch(e) { console.error('Supabase check error:', e); }
  }

  // Enforce limit for non-pro users
  if (!isPro && usageCount >= 10) {
    res.status(402).json({ error: 'Usage limit reached. Upgrade to Pro.' });
    return;
  }

  const { systemPrompt, userPrompt } = req.body;
  if (!systemPrompt || !userPrompt) { res.status(400).json({ error: 'Missing prompts' }); return; }

  // Call Anthropic
  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  try {
    const text = await new Promise((resolve, reject) => {
      const apiReq = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      }, apiRes => {
        let data = '';
        apiRes.on('data', c => { data += c; });
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.content?.map(b => b.text || '').join('') || '');
          } catch(e) { reject(new Error('Invalid Anthropic response')); }
        });
      });
      apiReq.on('error', reject);
      apiReq.write(body);
      apiReq.end();
    });

    // Increment usage in Supabase
    if (userId && !isPro && process.env.SUPABASE_URL) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await supa.from('profiles').update({ usage_count: usageCount + 1 }).eq('id', userId);
      } catch(e) { console.error('Usage increment error:', e); }
    }

    res.status(200).json({ text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
