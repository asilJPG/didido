export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let taskId = req.query.id || req.query.task_id || req.query.task;
  if (!taskId) {
    return res.status(400).json({ error: 'Укажите id задачи' });
  }

  // Extract clean UUID if wrapped in JSON or strings
  const match = String(taskId).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (match) {
    taskId = match[0];
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/didido_toggle_task`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_task_id: taskId })
    });
    const result = await response.json();
    return res.status(200).json({ success: true, task: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
