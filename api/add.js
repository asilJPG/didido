export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const username = req.query.username || req.query.user_id || req.query.user;
  const title = req.query.title || req.query.text;

  if (!username || !title) {
    return res.status(400).json({ error: 'Укажите username и title' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  try {
    const cleanUser = String(username).toLowerCase().trim();

    // 1. Find user
    let userRes = await fetch(`${url}/rest/v1/didido_users?username=ilike.${encodeURIComponent(cleanUser)}&select=id`, { headers });
    let users = await userRes.json();

    if (!users || users.length === 0) {
      if (cleanUser.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        userRes = await fetch(`${url}/rest/v1/didido_users?id=eq.${cleanUser}&select=id`, { headers });
        users = await userRes.json();
      }
    }

    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const userId = users[0].id;

    // 2. Find profile
    let profRes = await fetch(`${url}/rest/v1/didido_profiles?owner_id=eq.${userId}&select=id&order=created_at.asc&limit=1`, { headers });
    let profiles = await profRes.json();
    let profileId;
    if (profiles && profiles.length > 0) {
      profileId = profiles[0].id;
    } else {
      const newProf = await fetch(`${url}/rest/v1/didido_profiles`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ owner_id: userId, name: cleanUser })
      });
      const created = await newProf.json();
      profileId = created[0].id;
    }

    // Clean title from accidental emojis
    const cleanTitle = String(title)
      .replace(/^[\p{Emoji}\s✓]+/u, '')
      .trim();

    // 3. Insert task without emoji
    const insertRes = await fetch(`${url}/rest/v1/didido_tasks`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        profile_id: profileId,
        title: cleanTitle,
        icon: '✓',
        done: false
      })
    });
    const created = await insertRes.json();

    return res.status(200).json({ success: true, task: created[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
