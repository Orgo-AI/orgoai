const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  // Parse body manually if needed
  let bodyData = req.body;
  if (!bodyData || typeof bodyData === 'string') {
    try { bodyData = JSON.parse(bodyData || '{}'); } catch(e) { bodyData = {}; }
  }

  const { systemPrompt, userPrompt } = bodyData;
  if (!systemPrompt || !userPrompt) {
    res.status(400).json({ error: 'Missing prompts. Keys: ' + JSON.stringify(Object.keys(bodyData || {})) });
    return;
  }

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
            console.log('Anthropic status:', apiRes.statusCode);
            console.log('Anthropic raw:', data.substring(0, 300));
            const parsed = JSON.parse(data);
            if (parsed.error) { reject(new Error('Anthropic: ' + parsed.error.message)); return; }
            const text = parsed.content?.map(b => b.text || '').join('') || '';
            resolve(text);
          } catch(e) {
            console.error('Parse error:', data.substring(0, 200));
            reject(new Error('Invalid Anthropic response: ' + data.substring(0, 100)));
          }
        });
      });
      apiReq.on('error', reject);
      apiReq.write(body);
      apiReq.end();
    });

    res.status(200).json({ text });
  } catch(e) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
