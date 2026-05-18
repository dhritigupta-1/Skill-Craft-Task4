/* ===== TASKFLOW APP.JS ===== */
'use strict';

// ── State ──────────────────────────────────────────────────────────────
let state = {
  tasks: [],
  lists: [
    { id: 'default', name: 'Personal', color: '#6C63FF' },
    { id: 'work',    name: 'Work',     color: '#FF6584' },
  ],
  activeFilter: 'all',
  activeList: null,   // null = show all
  searchQuery: '',
  sortBy: 'created',
  editingTaskId: null,
  deletingTaskId: null,
  newListColor: '#6C63FF',
  tags: [],           // temp tags for modal
};

// ── Persistence ────────────────────────────────────────────────────────
const save = () => {
  localStorage.setItem('taskflow_tasks', JSON.stringify(state.tasks));
  localStorage.setItem('taskflow_lists', JSON.stringify(state.lists));
};
const load = () => {
  try {
    const t = localStorage.getItem('taskflow_tasks');
    const l = localStorage.getItem('taskflow_lists');
    if (t) state.tasks = JSON.parse(t);
    if (l) state.lists = JSON.parse(l);
  } catch(e) {}
};

// ── Helpers ────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const fmtDate = (dateStr, timeStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + (timeStr ? 'T' + timeStr : 'T00:00'));
  if (isNaN(d)) return null;
  const opts = { month:'short', day:'numeric' };
  if (timeStr) opts.hour = '2-digit', opts.minute = '2-digit';
  return d.toLocaleString(undefined, opts);
};

const isToday = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr); const n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
};

const isOverdue = (dateStr, timeStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr + (timeStr ? 'T' + timeStr : 'T23:59'));
  return d < new Date();
};

const isUpcoming = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const n = new Date(); n.setHours(0,0,0,0);
  const next7 = new Date(n); next7.setDate(n.getDate()+7);
  return d > n && d <= next7;
};

const getPriorityOrder = p => ({ high:0, medium:1, low:2 }[p] ?? 1);

// ── Toast ──────────────────────────────────────────────────────────────
let toastTimer;
const toast = (msg, type='info') => {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
};

// ── Filter / Sort Tasks ────────────────────────────────────────────────
const getFilteredTasks = () => {
  let tasks = [...state.tasks];

  // List filter
  if (state.activeList) tasks = tasks.filter(t => t.listId === state.activeList);

  // Tab filter
  if (state.activeFilter === 'completed') tasks = tasks.filter(t => t.completed);
  else if (state.activeFilter === 'today') tasks = tasks.filter(t => isToday(t.date));
  else if (state.activeFilter === 'upcoming') tasks = tasks.filter(t => isUpcoming(t.date) && !t.completed);
  else if (state.activeFilter === 'overdue') tasks = tasks.filter(t => !t.completed && isOverdue(t.date, t.time));

  // Search
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    tasks = tasks.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.desc && t.desc.toLowerCase().includes(q)) ||
      (t.tags && t.tags.some(tag => tag.toLowerCase().includes(q)))
    );
  }

  // Sort
  tasks.sort((a, b) => {
    if (state.sortBy === 'dueDate') {
      const da = a.date ? new Date(a.date) : new Date('9999');
      const db = b.date ? new Date(b.date) : new Date('9999');
      return da - db;
    }
    if (state.sortBy === 'priority') return getPriorityOrder(a.priority) - getPriorityOrder(b.priority);
    if (state.sortBy === 'name') return a.name.localeCompare(b.name);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return tasks;
};

// ── Stats ──────────────────────────────────────────────────────────────
const updateStats = () => {
  const all = state.tasks;
  const done = all.filter(t => t.completed).length;
  document.getElementById('statTotal').textContent = all.length;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statPending').textContent = all.length - done;

  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  document.getElementById('progressBarFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = pct + '% completed';
  document.getElementById('progressFraction').textContent = `${done} / ${all.length}`;
};

// ── Render Sidebar Lists ───────────────────────────────────────────────
const renderLists = () => {
  const nav = document.getElementById('listsNav');
  nav.innerHTML = '';

  // "All" pseudo-list
  const allLi = document.createElement('li');
  allLi.className = 'list-item' + (state.activeList === null && !['completed','today','upcoming','overdue'].includes(state.activeFilter) ? ' active' : '');
  allLi.dataset.listId = '';
  allLi.innerHTML = `
    <span class="list-dot" style="background:#6C63FF"></span>
    <span class="list-item-name">All Lists</span>
    <span class="list-count">${state.tasks.length}</span>
  `;
  allLi.addEventListener('click', () => { state.activeList = null; state.activeFilter='all'; renderAll(); });
  nav.appendChild(allLi);

  state.lists.forEach(list => {
    const count = state.tasks.filter(t => t.listId === list.id).length;
    const li = document.createElement('li');
    li.className = 'list-item' + (state.activeList === list.id ? ' active' : '');
    li.dataset.listId = list.id;
    li.innerHTML = `
      <span class="list-dot" style="background:${list.color}"></span>
      <span class="list-item-name">${escHtml(list.name)}</span>
      <span class="list-count">${count}</span>
      <button class="list-delete-btn" title="Delete list" data-list-id="${list.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    `;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.list-delete-btn')) return;
      state.activeList = list.id;
      state.activeFilter = 'all';
      renderAll();
    });
    li.querySelector('.list-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`Delete list "${list.name}"? Tasks in it won't be deleted.`)) return;
      state.lists = state.lists.filter(l => l.id !== list.id);
      if (state.activeList === list.id) state.activeList = null;
      save(); renderAll();
      toast(`List "${list.name}" deleted`, 'info');
    });
    nav.appendChild(li);
  });
};

// ── Render Filter Nav ──────────────────────────────────────────────────
const renderFilterNav = () => {
  document.querySelectorAll('.filter-item').forEach(el => {
    el.classList.toggle('active', el.dataset.filter === state.activeFilter && state.activeList === null);
  });
};

// ── Render Page Title ──────────────────────────────────────────────────
const renderPageTitle = () => {
  let title = 'All Tasks';
  if (state.activeList) {
    const list = state.lists.find(l => l.id === state.activeList);
    title = list ? list.name : 'List';
  } else {
    const map = { all:'All Tasks', today:"Today's Tasks", upcoming:'Upcoming', completed:'Completed', overdue:'Overdue' };
    title = map[state.activeFilter] || 'Tasks';
  }
  document.getElementById('pageTitle').textContent = title;
  const filtered = getFilteredTasks();
  document.getElementById('taskCountBadge').textContent = `${filtered.length} task${filtered.length !== 1 ? 's' : ''}`;
};

// ── Escape HTML ────────────────────────────────────────────────────────
const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Render Tasks ───────────────────────────────────────────────────────
const renderTasks = () => {
  const grid = document.getElementById('taskGrid');
  const emptyState = document.getElementById('emptyState');
  const tasks = getFilteredTasks();

  grid.innerHTML = '';
  if (!tasks.length) { emptyState.style.display = 'flex'; return; }
  emptyState.style.display = 'none';

  tasks.forEach((task, idx) => {
    const list = state.lists.find(l => l.id === task.listId);
    const overdue = !task.completed && isOverdue(task.date, task.time);
    const today = isToday(task.date);
    const card = document.createElement('div');
    card.className = 'task-card' + (task.completed ? ' completed' : '');
    card.dataset.priority = task.priority || 'medium';
    card.dataset.taskId = task.id;
    card.style.animationDelay = (idx * 40) + 'ms';

    const dateFmt = fmtDate(task.date, task.time);

    card.innerHTML = `
      <div class="card-header">
        <div class="card-checkbox${task.completed ? ' checked' : ''}" data-task-id="${task.id}" id="chk-${task.id}" title="Toggle complete"></div>
        <span class="task-title">${escHtml(task.name)}</span>
      </div>
      ${task.desc ? `<p class="card-desc">${escHtml(task.desc)}</p>` : ''}
      <div class="card-meta">
        ${list ? `<span class="meta-chip chip-list" style="background:${list.color}22;color:${list.color};border-color:${list.color}44">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          ${escHtml(list.name)}
        </span>` : ''}
        ${dateFmt ? `<span class="meta-chip ${overdue ? 'chip-overdue' : today ? 'chip-today' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${overdue ? '⚠ ' : today ? '☀ ' : ''}${dateFmt}
        </span>` : ''}
        ${task.priority ? `<span class="meta-chip">${task.priority==='high'?'🔴':task.priority==='medium'?'🟡':'🟢'} ${task.priority[0].toUpperCase()+task.priority.slice(1)}</span>` : ''}
      </div>
      ${task.tags && task.tags.length ? `<div class="card-tags">${task.tags.map(t=>`<span class="tag-pill">#${escHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="card-actions">
        <button class="action-btn edit" data-task-id="${task.id}" title="Edit task">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="action-btn delete" data-task-id="${task.id}" title="Delete task">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    `;

    // 3D mouse-tilt effect
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      card.style.transform = `translateY(-6px) rotateX(${-dy * 6}deg) rotateY(${dx * 6}deg) scale(1.01)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });

    // Checkbox
    card.querySelector('.card-checkbox').addEventListener('click', () => toggleTask(task.id));
    // Edit
    card.querySelector('.action-btn.edit').addEventListener('click', () => openEditModal(task.id));
    // Delete
    card.querySelector('.action-btn.delete').addEventListener('click', () => openDeleteModal(task.id));

    grid.appendChild(card);
  });
};

const renderAll = () => {
  renderLists();
  renderFilterNav();
  renderPageTitle();
  renderTasks();
  updateStats();
};

// ── Toggle Task ────────────────────────────────────────────────────────
const toggleTask = (id) => {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  save(); renderAll();
  toast(task.completed ? '✅ Task completed!' : 'Task marked pending', task.completed ? 'success' : 'info');
};

// ── Task Modal ─────────────────────────────────────────────────────────
const openAddModal = () => {
  state.editingTaskId = null;
  state.tags = [];
  document.getElementById('taskModalTitle').textContent = 'New Task';
  document.getElementById('taskName').value = '';
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskDate').value = '';
  document.getElementById('taskTime').value = '';
  document.getElementById('taskPriority').value = 'medium';
  populateListSelect();
  renderTagsInModal();
  document.getElementById('taskModal').style.display = 'flex';
  setTimeout(() => document.getElementById('taskName').focus(), 100);
};

const openEditModal = (id) => {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  state.editingTaskId = id;
  state.tags = [...(task.tags || [])];
  document.getElementById('taskModalTitle').textContent = 'Edit Task';
  document.getElementById('taskName').value = task.name;
  document.getElementById('taskDesc').value = task.desc || '';
  document.getElementById('taskDate').value = task.date || '';
  document.getElementById('taskTime').value = task.time || '';
  document.getElementById('taskPriority').value = task.priority || 'medium';
  populateListSelect(task.listId);
  renderTagsInModal();
  document.getElementById('taskModal').style.display = 'flex';
  setTimeout(() => document.getElementById('taskName').focus(), 100);
};

const closeTaskModal = () => { document.getElementById('taskModal').style.display = 'none'; };

const saveTask = () => {
  const name = document.getElementById('taskName').value.trim();
  if (!name) { document.getElementById('taskName').focus(); toast('Task name is required', 'error'); return; }
  const listId = document.getElementById('taskList').value;
  const priority = document.getElementById('taskPriority').value;
  const date = document.getElementById('taskDate').value;
  const time = document.getElementById('taskTime').value;
  const desc = document.getElementById('taskDesc').value.trim();

  if (state.editingTaskId) {
    const task = state.tasks.find(t => t.id === state.editingTaskId);
    if (task) { Object.assign(task, { name, desc, listId, priority, date, time, tags: [...state.tags], updatedAt: new Date().toISOString() }); }
    toast('Task updated ✏️', 'info');
  } else {
    state.tasks.unshift({ id: uid(), name, desc, listId, priority, date, time, tags: [...state.tags], completed: false, createdAt: new Date().toISOString() });
    toast('Task added! 🎉', 'success');
  }
  save(); closeTaskModal(); renderAll();
};

// ── List Select ────────────────────────────────────────────────────────
const populateListSelect = (selectedId) => {
  const sel = document.getElementById('taskList');
  sel.innerHTML = '<option value="">— No List —</option>';
  state.lists.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.id; opt.textContent = l.name;
    if (l.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
  if (state.activeList && !selectedId) sel.value = state.activeList;
};

// ── Tags ───────────────────────────────────────────────────────────────
const renderTagsInModal = () => {
  const list = document.getElementById('tagsList');
  list.innerHTML = '';
  state.tags.forEach((tag, i) => {
    const span = document.createElement('span');
    span.className = 'tag-pill-remove';
    span.innerHTML = `#${escHtml(tag)} <span class="tag-remove-x">×</span>`;
    span.addEventListener('click', () => { state.tags.splice(i, 1); renderTagsInModal(); });
    list.appendChild(span);
  });
};

document.getElementById('tagInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/^#/, '');
    if (val && !state.tags.includes(val) && state.tags.length < 8) {
      state.tags.push(val); renderTagsInModal(); e.target.value = '';
    }
  }
});

// ── List Modal ─────────────────────────────────────────────────────────
const openListModal = () => {
  state.newListColor = '#6C63FF';
  document.getElementById('listName').value = '';
  document.querySelectorAll('.color-btn').forEach(b => b.classList.toggle('active', b.dataset.color === '#6C63FF'));
  document.getElementById('listModal').style.display = 'flex';
  setTimeout(() => document.getElementById('listName').focus(), 100);
};
const closeListModal = () => { document.getElementById('listModal').style.display = 'none'; };

const saveList = () => {
  const name = document.getElementById('listName').value.trim();
  if (!name) { document.getElementById('listName').focus(); toast('List name required', 'error'); return; }
  const list = { id: uid(), name, color: state.newListColor };
  state.lists.push(list);
  save(); closeListModal(); renderAll();
  toast(`List "${name}" created 🗂️`, 'success');
};

document.getElementById('colorPicker').addEventListener('click', e => {
  const btn = e.target.closest('.color-btn');
  if (!btn) return;
  document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.newListColor = btn.dataset.color;
});

// ── Delete Modal ───────────────────────────────────────────────────────
const openDeleteModal = (id) => {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  state.deletingTaskId = id;
  document.getElementById('deleteTaskName').textContent = task.name;
  document.getElementById('deleteModal').style.display = 'flex';
};
const closeDeleteModal = () => { document.getElementById('deleteModal').style.display = 'none'; state.deletingTaskId = null; };

const confirmDelete = () => {
  if (!state.deletingTaskId) return;
  const task = state.tasks.find(t => t.id === state.deletingTaskId);
  state.tasks = state.tasks.filter(t => t.id !== state.deletingTaskId);
  save(); closeDeleteModal(); renderAll();
  toast(`"${task?.name}" deleted`, 'info');
};

// ── Event Listeners ────────────────────────────────────────────────────
document.getElementById('btnAddTask').addEventListener('click', openAddModal);
document.getElementById('btnAddList').addEventListener('click', openListModal);

document.getElementById('taskModalClose').addEventListener('click', closeTaskModal);
document.getElementById('taskModalCancel').addEventListener('click', closeTaskModal);
document.getElementById('taskModalSave').addEventListener('click', saveTask);

document.getElementById('listModalClose').addEventListener('click', closeListModal);
document.getElementById('listModalCancel').addEventListener('click', closeListModal);
document.getElementById('listModalSave').addEventListener('click', saveList);

document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalCancel').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalConfirm').addEventListener('click', confirmDelete);

// Close modal on overlay click
['taskModal','listModal','deleteModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      if (id==='taskModal') closeTaskModal();
      else if (id==='listModal') closeListModal();
      else closeDeleteModal();
    }
  });
});

// Filter nav
document.querySelectorAll('.filter-item').forEach(el => {
  el.addEventListener('click', () => {
    state.activeFilter = el.dataset.filter;
    state.activeList = null;
    renderAll();
  });
});

// Search
let searchDebounce;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { state.searchQuery = e.target.value.trim(); renderAll(); }, 200);
});

// Sort
document.getElementById('sortSelect').addEventListener('change', e => { state.sortBy = e.target.value; renderTasks(); });

// Sidebar toggle
document.getElementById('sidebarToggle').addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('open');
});

// Mobile menu
document.getElementById('mobileMenuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// Enter key in modals
document.getElementById('taskName').addEventListener('keydown', e => { if (e.key === 'Enter') saveTask(); });
document.getElementById('listName').addEventListener('keydown', e => { if (e.key === 'Enter') saveList(); });

// Keyboard shortcut: N = new task
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'n' || e.key === 'N') openAddModal();
  if (e.key === 'Escape') { closeTaskModal(); closeListModal(); closeDeleteModal(); }
});

// ── Init ───────────────────────────────────────────────────────────────
load();
renderAll();
