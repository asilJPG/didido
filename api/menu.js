export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const user = req.query.username || req.query.user_id || req.query.user;

  if (!user) {
    return res.status(400).json([{ id: 'ERROR', title: '❌ Укажите ?username=ваш_логин' }]);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  try {
    const mRes = await fetch(`${url}/rest/v1/rpc/didido_shortcut_menu_by_user`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_user: user })
    });
    const menu = await mRes.json();

    return res.status(200).json(menu);
  } catch (err) {
    return res.status(500).json([{ id: 'ERROR', title: `❌ Ошибка: ${err.message}` }]);
  }
}
