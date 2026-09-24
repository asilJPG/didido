const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

const config = window.DIDIDO_CONFIG || {
  url: 'https://qrfdpzigcarbethrsioe.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZmRwemlnY2FyYmV0aHJzaW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzMDA5MTAsImV4cCI6MjA5OTg3NjkxMH0.4-woG-u6WXp48RCGqVFf_gZ2aVYwYHStZiEJ8EzLXk0'
};
const db = window.supabase.createClient(config.url, config.key);

let currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('didido_user') || 'null'); } catch { return null; }
})();
let tasks = [];
let profiles = [];
let activeProfileId = localStorage.getItem('didido-active-profile') || null;
let currentFilter = 'all';
let creatingAccount = false;

function showToast(message) {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

function dayLabel() {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

function completedAt(value) {
  return value ? `Сделано в ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))}` : 'Ещё не отмечено';
}

function render() {
  const list = $('#task-list');
  list.replaceChildren();

  const total = tasks.length;
  const doneCount = tasks.filter(t => t.done).length;
  const pendingCount = total - doneCount;

  $('#count-all').textContent = total;
  $('#count-pending').textContent = pendingCount;
  $('#count-done').textContent = doneCount;

  $('#progress').textContent = `${doneCount} из ${total} сделано`;
  $('#progress-bar').style.width = `${total ? (doneCount / total) * 100 : 0}%`;

  let filtered = [...tasks];
  if (currentFilter === 'pending') filtered = filtered.filter(t => !t.done);
  if (currentFilter === 'done') filtered = filtered.filter(t => t.done);

  filtered.sort((a, b) => Number(a.done) - Number(b.done));

  $('#empty').hidden = filtered.length > 0;

  filtered.forEach(task => {
    const node = $('#task-template').content.firstElementChild.cloneNode(true);
    node.classList.toggle('done', task.done);
    node.querySelector('h2').textContent = task.title;
    node.querySelector('p').textContent = completedAt(task.done_at);
    
    const yesBtn = node.querySelector('.yes');
    yesBtn.textContent = task.done ? 'ДА' : '—';
    yesBtn.onclick = () => toggle(task);

    const checkBtn = node.querySelector('.check');
    checkBtn.textContent = task.done ? '✓' : '';
    checkBtn.onclick = () => toggle(task);

    const delBtn = node.querySelector('.btn-delete-task');
    delBtn.onclick = () => deleteTask(task);

    list.append(node);
  });
}

async function toggle(task) {
  const done = !task.done;
  const done_at = done ? new Date().toISOString() : null;
  
  // Optimistic UI update
  task.done = done;
  task.done_at = done_at;
  render();

  const { error } = await db.from('didido_tasks').update({ done, done_at }).eq('id', task.id);
  if (error) {
    showToast(error.message);
    task.done = !done;
    task.done_at = !done ? new Date().toISOString() : null;
    render();
  }
}

async function deleteTask(task) {
  if (!confirm(`Удалить проверку «${task.title}»?`)) return;
  const prevTasks = [...tasks];
  tasks = tasks.filter(t => t.id !== task.id);
  render();

  const { error } = await db.from('didido_tasks').delete().eq('id', task.id);
  if (error) {
    showToast(error.message);
    tasks = prevTasks;
    render();
  } else {
    showToast('Проверка удалена');
  }
}

async function resetAllTasks() {
  if (!tasks.length) return;
  if (!confirm('Сбросить все отметки на новый день?')) return;

  tasks.forEach(t => { t.done = false; t.done_at = null; });
  render();

  const { error } = await db.from('didido_tasks')
    .update({ done: false, done_at: null })
    .eq('profile_id', activeProfileId);

  if (error) {
    showToast(error.message);
    loadTasks();
  } else {
    showToast('Отметки сброшены на новый день ✨');
  }
}

async function loadTasks() {
  if (!activeProfileId) {
    tasks = [];
    render();
    return;
  }
  const { data, error } = await db.from('didido_tasks').select('*').eq('profile_id', activeProfileId).order('created_at', { ascending: false });
  if (error) return showToast(error.message);
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
  
  if (error) {
    console.error('Failed to load profiles:', error);
    localStorage.removeItem('didido_user');
    localStorage.removeItem('didido-active-profile');
    currentUser = null;
    $('#auth-screen').hidden = false;
    $('#app').hidden = true;
    return;
  }
  profiles = data || [];

  if (profiles.length === 0) {
    const defaultName = currentUser.username || 'Мой профиль';
    const { data: newProfile, error: createErr } = await db.from('didido_profiles').insert({
      owner_id: currentUser.id,
      name: defaultName
    }).select().single();
    if (createErr) {
      console.error('Failed to create initial profile:', createErr);
      localStorage.removeItem('didido_user');
      localStorage.removeItem('didido-active-profile');
      currentUser = null;
      $('#auth-screen').hidden = false;
      $('#app').hidden = true;
      return;
    } else if (newProfile) {
      profiles = [newProfile];
    }
  }

  if (!profiles.some(p => p.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id || null;
  }
  localStorage.setItem('didido-active-profile', activeProfileId || '');
  renderProfilesBar();
  renderProfilesDialog();
  loadTasks();
}

function renderProfilesBar() {
  const bar = $('#profiles-bar');
  const addBtn = $('#btn-quick-add-profile');
  bar.querySelectorAll('.profile-tab').forEach(el => el.remove());

  profiles.forEach(profile => {
    const tab = document.createElement('button');
    tab.className = `profile-tab ${profile.id === activeProfileId ? 'active' : ''}`;
    tab.textContent = profile.name;
    tab.onclick = () => {
      activeProfileId = profile.id;
      localStorage.setItem('didido-active-profile', profile.id);
      renderProfilesBar();
      renderProfilesDialog();
      loadTasks();
    };
    bar.insertBefore(tab, addBtn);
  });

  if (currentUser?.id) {
    const origin = window.location.origin;
    const user = currentUser.username || currentUser.id;
    
    const menuEp = $('#shortcut-menu-endpoint');
    if (menuEp) {
      menuEp.textContent = `${origin}/api/menu?username=${user}`;
      menuEp.onclick = () => {
        navigator.clipboard.writeText(menuEp.textContent);
        showToast('Ссылка меню скопирована!');
      };
    }

    const toggleEp = $('#shortcut-toggle-endpoint');
    if (toggleEp) {
      toggleEp.textContent = `${origin}/api/toggle?id=[Выбранный элемент]&username=${user}`;
      toggleEp.onclick = () => {
        navigator.clipboard.writeText(toggleEp.textContent);
        showToast('Ссылка переключения скопирована!');
      };
    }

    const addEp = $('#shortcut-add-endpoint');
    if (addEp) {
      addEp.textContent = `${origin}/api/add?username=${user}&title=[Предоставленный ввод]`;
      addEp.onclick = () => {
        navigator.clipboard.writeText(addEp.textContent);
        showToast('Ссылка добавления скопирована!');
      };
    }
  }
}

function renderProfilesDialog() {
  const list = $('#profiles-list');
  list.replaceChildren();

  profiles.forEach(profile => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `profile-choice${profile.id === activeProfileId ? ' active' : ''}`;
    button.textContent = profile.name + (profile.id === activeProfileId ? ' (активен)' : '');
    button.onclick = () => {
      activeProfileId = profile.id;
      localStorage.setItem('didido-active-profile', profile.id);
      $('#profiles-dialog').close();
      renderProfilesBar();
      renderProfilesDialog();
      loadTasks();
    };
    list.append(button);
  });
}

// Auth events
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

// Add task
$('#add-form').onsubmit = async event => {
  event.preventDefault();
  const input = $('#task-title'), title = input.value.trim();
  if (!title || !activeProfileId) return;

  const { data, error } = await db.from('didido_tasks').insert({
    profile_id: activeProfileId,
    title,
    icon: '✓'
  }).select().single();

  if (error) return showToast(error.message);
  tasks.unshift(data);
  input.value = '';
  render();
};

// Filter clicks
$$('.filter-chip').forEach(btn => {
  btn.onclick = () => {
    $$('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  };
});

// Suggestion clicks
$$('.suggestion-chip').forEach(chip => {
  chip.onclick = async () => {
    const title = chip.dataset.title;
    if (!activeProfileId) return;

    const { data, error } = await db.from('didido_tasks').insert({
      profile_id: activeProfileId,
      title,
      icon: '✓'
    }).select().single();

    if (error) return showToast(error.message);
    tasks.unshift(data);
    render();
    showToast(`Добавлено: ${title}`);
  };
});

// Dialog buttons
$('#profile-button').onclick = () => $('#profiles-dialog').showModal();
$('#btn-quick-add-profile').onclick = () => $('#profiles-dialog').showModal();
$('#close-dialog').onclick = () => $('#profiles-dialog').close();

$('#shortcuts-button').onclick = () => $('#shortcuts-dialog').showModal();
$('#close-shortcuts-dialog').onclick = () => $('#shortcuts-dialog').close();

$('#btn-reset-all').onclick = resetAllTasks;

$('#profile-form').onsubmit = async event => {
  event.preventDefault();
  const name = $('#profile-name').value.trim();
  if (!name || !currentUser?.id) return;
  const { data, error } = await db.from('didido_profiles').insert({ owner_id: currentUser.id, name }).select().single();
  if (error) return showToast(error.message);
  
  $('#profile-name').value = '';
  activeProfileId = data.id;
  localStorage.setItem('didido-active-profile', activeProfileId);
  $('#profiles-dialog').close();
  showToast(`Профиль «${name}» создан`);
  loadProfiles();
};

$('#sign-out').onclick = () => {
  if (confirm('Выйти из аккаунта?')) {
    currentUser = null;
    localStorage.removeItem('didido_user');
    localStorage.removeItem('didido-active-profile');
    location.reload();
  }
};

function renderVersion() {
  const version = config.version || 'dev';
  const display = version === 'dev' ? 'v.dev' : `v.${version}`;
  const commitUrl = version !== 'dev' ? `https://github.com/asilJPG/didido/commit/${version}` : 'https://github.com/asilJPG/didido';
  
  const authEl = $('#auth-version');
  if (authEl) {
    authEl.textContent = display;
    authEl.href = commitUrl;
    authEl.title = `Коммит: ${version}`;
  }
  const appEl = $('#app-version');
  if (appEl) {
    appEl.textContent = display;
    appEl.href = commitUrl;
    appEl.title = `Коммит: ${version}`;
  }
}

renderVersion();

if (currentUser?.id) {
  showApp();
}
