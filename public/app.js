// Utility functions
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

// Supabase client initialization
const db = window.supabase.createClient(window.DIDIDO_CONFIG.url, window.DIDIDO_CONFIG.key);

// State
let currentUser = (() => {
  try { return JSON.parse(localStorage.getItem('didido_user') || 'null'); } catch { return null; }
})();
let tasks = [];
let profiles = [];
let activeProfileId = localStorage.getItem('didido-active-profile') || null;
let currentFilter = 'all'; // 'all' | 'pending' | 'done'
let creatingAccount = false;

// Smart emoji keyword matcher
function detectIcon(title) {
  const t = title.toLowerCase();
  if (t.includes('двер') || t.includes('замок') || t.includes('ключ')) return '🔑';
  if (t.includes('утюг') || t.includes('розетк') || t.includes('зарядк')) return '🔌';
  if (t.includes('плит') || t.includes('газ') || t.includes('чайник')) return '🍳';
  if (t.includes('таблет') || t.includes('витамин') || t.includes('лекарств')) return '💊';
  if (t.includes('кот') || t.includes('собак') || t.includes('питом') || t.includes('корм')) return '🐈';
  if (t.includes('окн') || t.includes('форточк') || t.includes('балкон')) return '🪟';
  if (t.includes('вод') || t.includes('кран') || t.includes('душ')) return '🚰';
  if (t.includes('свет') || t.includes('ламп')) return '💡';
  if (t.includes('мусор') || t.includes('пакет')) return '🗑️';
  if (t.includes('машин') || t.includes('авто') || t.includes('гараж')) return '🚗';
  if (t.includes('карт') || t.includes('кошелек') || t.includes('деньг') || t.includes('паспорт')) return '💳';
  if (t.includes('цвет') || t.includes('полит') || t.includes('растен')) return '🪴';
  if (t.includes('рук') || t.includes('мыл')) return '🧼';
  return '✓';
}

// Toast notification helper
function showToast(message, type = 'success') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 2800);
}

function formatDateHeader() {
  const now = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  return new Intl.DateTimeFormat('ru-RU', options).format(now);
}

function formatTaskTime(isoString) {
  if (!isoString) return 'Ожидает проверки';
  const date = new Date(isoString);
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `Проверено в ${time}`;
}

// Render task list & stats
function render() {
  const list = $('#task-list');
  list.innerHTML = '';

  const total = tasks.length;
  const doneCount = tasks.filter(t => t.done).length;
  const pendingCount = total - doneCount;

  // Update counters
  $('#count-all').textContent = total;
  $('#count-pending').textContent = pendingCount;
  $('#count-done').textContent = doneCount;

  $('#progress-text').textContent = `${doneCount} из ${total} сделано`;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  $('#progress-bar').style.width = `${percent}%`;

  const progressTag = $('#progress-tag');
  if (total > 0 && doneCount === total) {
    progressTag.textContent = '🎉 Всё готово!';
    progressTag.classList.add('all-done');
  } else {
    progressTag.textContent = `${percent}% готово`;
    progressTag.classList.remove('all-done');
  }

  // Filter tasks
  let filtered = [...tasks];
  if (currentFilter === 'pending') filtered = filtered.filter(t => !t.done);
  if (currentFilter === 'done') filtered = filtered.filter(t => t.done);

  // Sort: pending first, then by created_at
  filtered.sort((a, b) => Number(a.done) - Number(b.done));

  $('#empty').hidden = filtered.length > 0;

  filtered.forEach(task => {
    const card = document.createElement('div');
    card.className = `task-card ${task.done ? 'done' : ''}`;

    const checkBtn = document.createElement('button');
    checkBtn.className = 'task-check-circle';
    checkBtn.textContent = task.done ? '✓' : '';
    checkBtn.title = task.done ? 'Снять отметку' : 'Отметить выполненным';
    checkBtn.onclick = () => toggleTask(task);

    const iconBadge = document.createElement('div');
    iconBadge.className = 'task-icon-badge';
    iconBadge.textContent = task.icon || '✓';

    const content = document.createElement('div');
    content.className = 'task-content';
    
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;

    const time = document.createElement('div');
    time.className = 'task-time';
    time.textContent = formatTaskTime(task.done_at);

    content.append(title, time);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-task-toggle';
    toggleBtn.textContent = task.done ? 'ДА' : '—';
    toggleBtn.onclick = () => toggleTask(task);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-task-delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Удалить проверку';
    deleteBtn.onclick = () => deleteTask(task);

    actions.append(toggleBtn, deleteBtn);

    card.append(checkBtn, iconBadge, content, actions);
    list.appendChild(card);
  });
}

// Database operations
async function toggleTask(task) {
  const newDone = !task.done;
  const newDoneAt = newDone ? new Date().toISOString() : null;

  // Optimistic UI update
  task.done = newDone;
  task.done_at = newDoneAt;
  render();

  const { error } = await db.from('didido_tasks').update({
    done: newDone,
    done_at: newDoneAt
  }).eq('id', task.id);

  if (error) {
    showToast(error.message, 'error');
    // Revert on failure
    task.done = !newDone;
    task.done_at = !newDone ? new Date().toISOString() : null;
    render();
  } else if (newDone) {
    showToast(`✓ «${task.title}» отмечено!`, 'success');
  }
}

async function deleteTask(task) {
  if (!confirm(`Удалить проверку «${task.title}»?`)) return;

  const prevTasks = [...tasks];
  tasks = tasks.filter(t => t.id !== task.id);
  render();

  const { error } = await db.from('didido_tasks').delete().eq('id', task.id);
  if (error) {
    showToast(error.message, 'error');
    tasks = prevTasks;
    render();
  } else {
    showToast('Проверка удалена', 'success');
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
    showToast(error.message, 'error');
    loadTasks();
  } else {
    showToast('Все проверки сброшены на новый день! ✨', 'success');
  }
}

async function loadTasks() {
  if (!activeProfileId) {
    tasks = [];
    render();
    return;
  }
  const { data, error } = await db.from('didido_tasks')
    .select('*')
    .eq('profile_id', activeProfileId)
    .order('created_at', { ascending: false });

  if (error) {
    showToast(error.message, 'error');
    return;
  }
  tasks = data || [];
  render();
}

async function loadProfiles() {
  if (!currentUser?.id) return;

  const { data, error } = await db.from('didido_profiles')
    .select('*')
    .eq('owner_id', currentUser.id)
    .order('created_at');

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  profiles = data || [];

  // Auto-create initial profile if none exists
  if (profiles.length === 0) {
    const defaultName = currentUser.username || 'Основной';
    const { data: newProfile, error: createErr } = await db.from('didido_profiles').insert({
      owner_id: currentUser.id,
      name: defaultName
    }).select().single();

    if (!createErr && newProfile) {
      profiles = [newProfile];
    }
  }

  if (!profiles.some(p => p.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id || null;
  }

  localStorage.setItem('didido-active-profile', activeProfileId || '');
  renderProfileTabs();
  renderProfilesDialogList();
  loadTasks();
}

function renderProfileTabs() {
  const bar = $('#profiles-bar');
  const addBtn = $('#btn-quick-add-profile');
  
  // Clear old tabs except the add button
  bar.querySelectorAll('.profile-tab').forEach(el => el.remove());

  profiles.forEach(profile => {
    const tab = document.createElement('button');
    tab.className = `profile-tab ${profile.id === activeProfileId ? 'active' : ''}`;
    tab.textContent = profile.name;
    tab.onclick = () => {
      activeProfileId = profile.id;
      localStorage.setItem('didido-active-profile', profile.id);
      renderProfileTabs();
      renderProfilesDialogList();
      loadTasks();
    };
    bar.insertBefore(tab, addBtn);
  });

  // Update shortcuts modal helper text
  if (activeProfileId) {
    const endpointEl = $('#shortcut-tasks-endpoint');
    if (endpointEl) {
      endpointEl.textContent = `GET /rest/v1/didido_tasks?profile_id=eq.${activeProfileId}&select=*`;
    }
  }
}

function renderProfilesDialogList() {
  const list = $('#profiles-list');
  list.innerHTML = '';

  profiles.forEach(profile => {
    const item = document.createElement('div');
    item.className = 'dialog-item';

    const nameSpan = document.createElement('span');
    nameSpan.style.fontWeight = profile.id === activeProfileId ? '700' : '500';
    nameSpan.textContent = profile.name + (profile.id === activeProfileId ? ' (текущий)' : '');

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '6px';

    const selectBtn = document.createElement('button');
    selectBtn.className = 'btn-task-toggle';
    selectBtn.textContent = 'Выбрать';
    selectBtn.onclick = () => {
      activeProfileId = profile.id;
      localStorage.setItem('didido-active-profile', profile.id);
      $('#profiles-dialog').close();
      renderProfileTabs();
      renderProfilesDialogList();
      loadTasks();
    };

    btnGroup.appendChild(selectBtn);

    if (profiles.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-task-delete';
      delBtn.style.opacity = '1';
      delBtn.textContent = '🗑️';
      delBtn.title = 'Удалить список';
      delBtn.onclick = async () => {
        if (!confirm(`Удалить список «${profile.name}» и все его проверки?`)) return;
        const { error } = await db.from('didido_profiles').delete().eq('id', profile.id);
        if (error) {
          showToast(error.message, 'error');
        } else {
          showToast('Список удалён', 'success');
          loadProfiles();
        }
      };
      btnGroup.appendChild(delBtn);
    }

    item.append(nameSpan, btnGroup);
    list.appendChild(item);
  });
}

function showApp() {
  $('#auth-screen').hidden = true;
  $('#app').hidden = false;
  $('#date').textContent = formatDateHeader();
  $('#nav-username').textContent = currentUser?.username || 'Выйти';
  loadProfiles();
}

// Event Listeners
$('#auth-form').onsubmit = async event => {
  event.preventDefault();
  const username = $('#username').value.trim();
  const password = $('#password').value;
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
  $('#auth-switch').textContent = creatingAccount ? 'У меня уже есть аккаунт' : 'Создать новый аккаунт';
  $('#password').autocomplete = creatingAccount ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
};

// Add task form
$('#add-form').onsubmit = async event => {
  event.preventDefault();
  const input = $('#task-title');
  const title = input.value.trim();
  if (!title || !activeProfileId) return;

  const icon = detectIcon(title);

  const { data, error } = await db.from('didido_tasks').insert({
    profile_id: activeProfileId,
    title,
    icon
  }).select().single();

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  tasks.unshift(data);
  input.value = '';
  render();
  showToast(`Проверка «${title}» добавлена!`, 'success');
};

// Filter tabs
$$('.filter-btn').forEach(btn => {
  btn.onclick = () => {
    $$('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  };
});

// Quick suggestion chips
$$('.suggestion-chip').forEach(chip => {
  chip.onclick = async () => {
    const title = chip.dataset.title;
    if (!activeProfileId) return;
    const icon = detectIcon(title);

    const { data, error } = await db.from('didido_tasks').insert({
      profile_id: activeProfileId,
      title,
      icon
    }).select().single();

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    tasks.unshift(data);
    render();
    showToast(`Добавлено: ${title}`, 'success');
  };
});

// Reset all tasks
$('#btn-reset-all').onclick = resetAllTasks;

// Profiles modal controls
$('#profile-button').onclick = () => $('#profiles-dialog').showModal();
$('#btn-quick-add-profile').onclick = () => $('#profiles-dialog').showModal();
$('#close-dialog').onclick = () => $('#profiles-dialog').close();

$('#profile-form').onsubmit = async event => {
  event.preventDefault();
  const input = $('#profile-name');
  const name = input.value.trim();
  if (!name || !currentUser?.id) return;

  const { data, error } = await db.from('didido_profiles').insert({
    owner_id: currentUser.id,
    name
  }).select().single();

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  input.value = '';
  activeProfileId = data.id;
  localStorage.setItem('didido-active-profile', activeProfileId);
  $('#profiles-dialog').close();
  showToast(`Список «${name}» создан!`, 'success');
  loadProfiles();
};

// Shortcuts modal controls
$('#btn-shortcuts-guide').onclick = () => $('#shortcuts-dialog').showModal();
$('#close-shortcuts-dialog').onclick = () => $('#shortcuts-dialog').close();

// Sign out
$('#sign-out').onclick = () => {
  if (confirm('Выйти из аккаунта?')) {
    currentUser = null;
    localStorage.removeItem('didido_user');
    localStorage.removeItem('didido-active-profile');
    location.reload();
  }
};

// Bootstrap
if (currentUser?.id) {
  showApp();
}
