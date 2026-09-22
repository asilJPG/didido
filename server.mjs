import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), 'public');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = (await readFile(join(process.cwd(), '.env'), 'utf8'))
      .split(/\r?\n/)
      .find(row => row.startsWith(`${name}=`));
    return line?.slice(name.length + 1).replace(/^['"]|['"]$/g, '') || '';
  } catch {
    return '';
  }
}

async function supabaseFetch(endpoint, method = 'GET', body = null) {
  const url = await envValue('NEXT_PUBLIC_SUPABASE_URL');
  const key = await envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
  const res = await fetch(`${url}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  return res.json();
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    return send(res, 204, '');
  }

  // Runtime config for browser
  if (path === '/config.js') {
    const url = await envValue('NEXT_PUBLIC_SUPABASE_URL');
    const key = await envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return send(res, 200, `window.DIDIDO_CONFIG=${JSON.stringify({ url, key })};`, 'text/javascript; charset=utf-8');
  }

  // 1. API: Get menu for user by user_id or username (No API keys needed in Shortcuts!)
  if (path === '/api/menu' || path === '/api/tasks') {
    const userId = url.searchParams.get('user_id');
    const username = url.searchParams.get('username');

    if (!userId && !username) {
      return send(res, 400, { error: 'Укажите user_id или username' });
    }

    try {
      let resolvedUserId = userId;
      if (!resolvedUserId && username) {
        const users = await supabaseFetch(`/rest/v1/didido_users?username=eq.${encodeURIComponent(username.toLowerCase())}&select=id&limit=1`);
        resolvedUserId = users?.[0]?.id;
      }

      if (!resolvedUserId) {
        return send(res, 404, { error: 'Пользователь не найден' });
      }

      // Get user's primary profile
      const profiles = await supabaseFetch(`/rest/v1/didido_profiles?owner_id=eq.${resolvedUserId}&order=created_at.asc&limit=1`);
      const profileId = profiles?.[0]?.id;

      if (!profileId) {
        return send(res, 200, [{ id: 'ADD_NEW', title: '➕ Добавить первую задачу' }]);
      }

      const menu = await supabaseFetch('/rest/v1/rpc/didido_shortcut_menu', 'POST', {
        p_profile_id: profileId
      });

      return send(res, 200, menu);
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  // 2. API: Toggle task status (NO headers needed!)
  if (path === '/api/toggle') {
    const taskId = url.searchParams.get('id') || url.searchParams.get('task_id');
    if (!taskId) {
      return send(res, 400, { error: 'Укажите id задачи' });
    }

    try {
      const result = await supabaseFetch('/rest/v1/rpc/didido_toggle_task', 'POST', {
        p_task_id: taskId
      });
      return send(res, 200, { success: true, task: result });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  // 3. API: Add task for user (NO headers needed!)
  if (path === '/api/add') {
    const userId = url.searchParams.get('user_id');
    const title = url.searchParams.get('title');

    if (!userId || !title) {
      return send(res, 400, { error: 'Укажите user_id и title' });
    }

    try {
      const profiles = await supabaseFetch(`/rest/v1/didido_profiles?owner_id=eq.${userId}&order=created_at.asc&limit=1`);
      const profileId = profiles?.[0]?.id;

      if (!profileId) {
        return send(res, 404, { error: 'Профиль не найден' });
      }

      const result = await supabaseFetch('/rest/v1/rpc/didido_add_task', 'POST', {
        p_profile_id: profileId,
        p_title: title
      });

      return send(res, 200, { success: true, task: result });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  // Static files serving
  const requested = path === '/' ? '/index.html' : path;
  const file = normalize(join(publicDir, requested));
  if (!file.startsWith(publicDir)) return send(res, 403, 'Forbidden', 'text/plain');

  try {
    await access(file, constants.R_OK);
    send(res, 200, await readFile(file), mime[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}).listen(port, () => console.log(`Didido running at http://localhost:${port}`));
