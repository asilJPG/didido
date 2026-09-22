export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const username = req.query.username || req.query.user_id || req.query.user;
  if (!username) {
    return res.status(400).json({ '❌ Укажите ?username=ваш_логин': 'ERROR' });
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

    // 1. Find user by username or ID
    let userRes = await fetch(`${url}/rest/v1/didido_users?username=ilike.${encodeURIComponent(cleanUser)}&select=id,username`, { headers });
    let users = await userRes.json();

    if (!users || users.length === 0) {
      // Check if it was a UUID directly
      if (cleanUser.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        userRes = await fetch(`${url}/rest/v1/didido_users?id=eq.${cleanUser}&select=id,username`, { headers });
        users = await userRes.json();
      }
    }

    if (!users || users.length === 0) {
      return res.status(200).json({ '❌ Пользователь не найден': 'ERROR' });
    }
    const userId = users[0].id;

    // 2. Find or create profile
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

    // 3. Get tasks
    const tasksRes = await fetch(`${url}/rest/v1/didido_tasks?profile_id=eq.${profileId}&select=id,title,icon,done,created_at&order=done.asc,created_at.desc`, { headers });
    const tasks = await tasksRes.json();

    // 4. Build iOS Dictionary (Keys = Display Title, Values = Task UUID)
    const menu = {};
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        const prefix = t.done ? '✓ [YES] ' : '○ [ NO ] ';
        const icon = t.icon ? `${t.icon} ` : '';
        const titleKey = `${prefix}${icon}${t.title}`;
        menu[titleKey] = t.id;
      }
    }
    menu['➕ Добавить новую проверку'] = 'ADD_NEW';

    return res.status(200).json(menu);
  } catch (err) {
    return res.status(500).json({ [`❌ Ошибка: ${err.message}`]: 'ERROR' });
  }
}
