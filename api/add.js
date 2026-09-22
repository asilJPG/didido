export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const user = req.query.username || req.query.user_id || req.query.user;
  const title = req.query.title;

  if (!user || !title) {
    return res.status(400).json({ error: 'Укажите username/user_id и title' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  try {
    const aRes = await fetch(`${url}/rest/v1/rpc/didido_add_task_by_user`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_user: user, p_title: title })
    });
    const result = await aRes.json();

    return res.status(200).json({ success: true, task: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
