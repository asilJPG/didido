const $ = selector => document.querySelector(selector);
const db = window.supabase.createClient(window.DIDIDO_CONFIG.url, window.DIDIDO_CONFIG.key);

let currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('didido_user') || 'null'); } catch { return null; }
})();
let tasks = [], profiles = [], activeProfileId = localStorage.getItem('didido-active-profile'), creatingAccount = false;
const icons = ['✓', '💊', '🔑', '🪴', '🧼', '🐈'];

function dayLabel() {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

function completedAt(value) {
  return value ? `Сделано в ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))}` : 'Ещё не отмечено';
}

function render() {
  const list = $('#task-list');
  list.replaceChildren();
  [...tasks].sort((a,b) => Number(a.done) - Number(b.done)).forEach(task => {
    const node = $('#task-template').content.firstElementChild.cloneNode(true);
    node.classList.toggle('done', task.done);
    node.querySelector('.task-icon').textContent = task.icon;
    node.querySelector('h2').textContent = task.title;
    node.querySelector('p').textContent = completedAt(task.done_at);
    node.querySelector('.yes').textContent = task.done ? 'ДА' : '—';
    node.querySelector('.check').textContent = task.done ? '✓' : '';
    node.querySelector('.check').onclick = () => toggle(task);
    node.querySelector('.yes').onclick = () => toggle(task);
    list.append(node);
  });
  const done = tasks.filter(t => t.done).length;
  $('#progress').textContent = `${done} из ${tasks.length} сделано`;
  $('#progress-bar').style.width = `${tasks.length ? done / tasks.length * 100 : 0}%`;
  $('#empty').hidden = tasks.length > 0;
}

async function toggle(task) {
  const done = !task.done;
  const { error } = await db.from('didido_tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', task.id);
  if (error) return alert(error.message);
  task.done = done;
  task.done_at = done ? new Date().toISOString() : null;
  render();
}

async function loadTasks() {
  if (!activeProfileId) return;
  const { data, error } = await db.from('didido_tasks').select('*').eq('profile_id', activeProfileId).order('created_at', { ascending: false });
  if (error) return alert(error.message);
  tasks = data || [];
  render();
}

function showApp() {
  $('#auth-screen').hidden = true;
  $('#app').hidden = false;
  $('#date').textContent = dayLabel();
  loadProfiles();
}

async function loadProfiles() {
  if (!currentUser?.id) return;
  const { data, error } = await db.from('didido_profiles').select('*').eq('owner_id', currentUser.id).order('created_at');
  if (error) return alert(error.message);
  profiles = data || [];
  if (!profiles.some(p => p.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id || null;
  }
  localStorage.setItem('didido-active-profile', activeProfileId || '');
  renderProfiles();
  loadTasks();
}

function renderProfiles() {
  const list = $('#profiles-list');
  list.replaceChildren();
  profiles.forEach(profile => {
    const button = document.createElement('button');
    button.className = `profile-choice${profile.id === activeProfileId ? ' active' : ''}`;
    button.textContent = profile.name;
    button.onclick = () => {
      activeProfileId = profile.id;
      localStorage.setItem('didido-active-profile', profile.id);
      $('#profiles-dialog').close();
      loadTasks();
    };
    list.append(button);
  });
}

$('#auth-form').onsubmit = async event => {
  event.preventDefault();
  const username = $('#username').value.trim(), password = $('#password').value;
  $('#auth-error').textContent = '';

  const rpcName = creatingAccount ? 'didido_register' : 'didido_login';
  const { data, error } = await db.rpc(rpcName, { p_username: username, p_password: password });

  if (error) {
    $('#auth-error').textContent = error.message;
    return;
  }

  currentUser = data;
  localStorage.setItem('didido_user', JSON.stringify(currentUser));
  showApp();
};

$('#auth-switch').onclick = () => {
  creatingAccount = !creatingAccount;
  $('#auth-submit').textContent = creatingAccount ? 'Создать аккаунт' : 'Войти';
  $('#auth-switch').textContent = creatingAccount ? 'У меня уже есть аккаунт' : 'Создать аккаунт';
  $('#password').autocomplete = creatingAccount ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
};

$('#add-form').onsubmit = async event => {
  event.preventDefault();
  const input = $('#task-title'), title = input.value.trim();
  if (!title || !activeProfileId) return;
  const { data, error } = await db.from('didido_tasks').insert({ profile_id: activeProfileId, title, icon: icons[(tasks.length + 1) % icons.length] }).select().single();
  if (error) return alert(error.message);
  tasks.unshift(data);
  input.value = '';
  render();
};

$('#profile-button').onclick = () => $('#profiles-dialog').showModal();
$('#close-dialog').onclick = () => $('#profiles-dialog').close();

$('#profile-form').onsubmit = async event => {
  event.preventDefault();
  const name = $('#profile-name').value.trim();
  if (!name || !currentUser?.id) return;
  const { error } = await db.from('didido_profiles').insert({ owner_id: currentUser.id, name });
  if (error) return alert(error.message);
  $('#profile-name').value = '';
  loadProfiles();
};

$('#sign-out').onclick = () => {
  currentUser = null;
  localStorage.removeItem('didido_user');
  localStorage.removeItem('didido-active-profile');
  location.reload();
};

if (currentUser?.id) {
  showApp();
}
