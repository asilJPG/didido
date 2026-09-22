export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let input = req.query.id || req.query.task_id || req.query.task || req.query.title;
  const username = req.query.username || req.query.user_id || req.query.user;

  if (!input) {
    return res.status(400).json({ error: 'Укажите id или название задачи' });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  try {
    let task = null;

    // 1. Check if input contains a UUID
    const uuidMatch = String(input).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      const taskId = uuidMatch[0];
      const tRes = await fetch(`${url}/rest/v1/didido_tasks?id=eq.${taskId}&select=*`, { headers });
      const tList = await tRes.json();
      if (Array.isArray(tList) && tList.length > 0) {
        task = tList[0];
      }
    }

    // 2. If not found by UUID, find by text/title
    if (!task) {
      let cleanText = String(input)
        .replace(/^[○✓]?\s*\[\s*(NO|YES)\s*\]\s*/i, '')
        .trim();
      cleanText = cleanText.replace(/^[\p{Emoji}\s]+/u, '').trim();

      let queryUrl = `${url}/rest/v1/didido_tasks?select=id,title,icon,done,done_at,profile_id&order=created_at.desc&limit=1`;
      
      if (username) {
        const uRes = await fetch(`${url}/rest/v1/didido_users?username=ilike.${encodeURIComponent(String(username).trim())}&select=id`, { headers });
        const uList = await uRes.json();
        if (Array.isArray(uList) && uList.length > 0) {
          const pRes = await fetch(`${url}/rest/v1/didido_profiles?owner_id=eq.${uList[0].id}&select=id`, { headers });
          const pList = await pRes.json();
          if (Array.isArray(pList) && pList.length > 0) {
            queryUrl += `&profile_id=eq.${pList[0].id}`;
          }
        }
      }

      // Try search by clean text
      if (cleanText) {
        const searchRes = await fetch(`${queryUrl}&title=ilike.*${encodeURIComponent(cleanText)}*`, { headers });
        const searchList = await searchRes.json();
        if (Array.isArray(searchList) && searchList.length > 0) {
          task = searchList[0];
        }
      }

      // Fallback: search with full raw string
      if (!task) {
        const rawRes = await fetch(`${queryUrl}&title=ilike.*${encodeURIComponent(String(input).trim())}*`, { headers });
        const rawList = await rawRes.json();
        if (Array.isArray(rawList) && rawList.length > 0) {
          task = rawList[0];
        }
      }
    }

    if (!task) {
      return res.status(404).json({ error: `Задача не найдена: ${input}` });
    }

    // Toggle status
    const newDone = !task.done;
    const newDoneAt = newDone ? new Date().toISOString() : null;

    const updateRes = await fetch(`${url}/rest/v1/didido_tasks?id=eq.${task.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ done: newDone, done_at: newDoneAt })
    });
    const updated = await updateRes.json();

    return res.status(200).json({
      success: true,
      id: task.id,
      title: task.title,
      done: newDone,
      status: newDone ? 'YES' : 'NO'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
