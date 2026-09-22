export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const userId = req.query.user_id;
  const username = req.query.username;

  if (!userId && !username) {
    return res.status(400).json({ error: 'Укажите user_id или username' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  try {
    let resolvedUserId = userId;
    if (!resolvedUserId && username) {
      const uRes = await fetch(`${url}/rest/v1/didido_users?username=eq.${encodeURIComponent(username.toLowerCase())}&select=id&limit=1`, { headers });
      const users = await uRes.json();
      resolvedUserId = users?.[0]?.id;
    }

    if (!resolvedUserId) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const pRes = await fetch(`${url}/rest/v1/didido_profiles?owner_id=eq.${resolvedUserId}&order=created_at.asc&limit=1`, { headers });
    const profiles = await pRes.json();
    const profileId = profiles?.[0]?.id;

    if (!profileId) {
      return res.status(200).json([{ id: 'ADD_NEW', title: '➕ Добавить первую задачу' }]);
    }

    const mRes = await fetch(`${url}/rest/v1/rpc/didido_shortcut_menu`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_profile_id: profileId })
    });
    const menu = await mRes.json();

    return res.status(200).json(menu);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
