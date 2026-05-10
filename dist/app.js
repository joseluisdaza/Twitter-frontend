// ── CONFIG ────────────────────────────────────────────────────────────────────
// La URL se inyecta desde runtime-config.js (generado por CDK al deployar).
// En desarrollo local, runtime-config.js contiene la URL del API Gateway.
const API_URL = ((window.RUNTIME_CONFIG?.apiUrl) || '').replace(/\/$/, '');

// ── STATE ─────────────────────────────────────────────────────────────────────
let state = { token: null, userId: null, username: null, displayName: null };
const userCache = {};

function loadState() {
  const s = localStorage.getItem('chirp_state');
  if (s) { state = JSON.parse(s); if (state.userId) userCache[state.userId] = { username: state.username, displayName: state.displayName }; }
}
function saveState() { localStorage.setItem('chirp_state', JSON.stringify(state)); }
function clearState() { state = { token: null, userId: null, username: null, displayName: null }; localStorage.removeItem('chirp_state'); }

// ── API HELPER ────────────────────────────────────────────────────────────────
async function apiCall(method, path, body = null, auth = true) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 204) return null;
    return res.json();
  } catch (err) { showToast('Error de conexión', 'error'); return null; }
}

// ── API ───────────────────────────────────────────────────────────────────────
const api = {
  register: (e, p, u, d) => apiCall('POST', '/auth/register', { email: e, password: p, username: u, displayName: d }, false),
  login: (e, p) => apiCall('POST', '/auth/login', { email: e, password: p }, false),
  logout: () => apiCall('POST', '/auth/logout', {}),
  createChirp: (content) => apiCall('POST', '/chirps', { content }),
  deleteChirp: (id) => apiCall('DELETE', `/chirps/${id}`),
  hideChirp: (id) => apiCall('POST', `/chirps/${id}/hide`, {}),
  likeChirp: (id) => apiCall('POST', `/chirps/${id}/like`, {}),
  unlikeChirp: (id) => apiCall('DELETE', `/chirps/${id}/like`),
  getChirpLikes: (id) => apiCall('GET', `/chirps/${id}/likes`, null, false),
  getChirpComments: (id) => apiCall('GET', `/chirps/${id}/comments`, null, false),
  createComment: (id, content) => apiCall('POST', `/chirps/${id}/comments`, { content }),
  deleteComment: (id, cid) => apiCall('DELETE', `/chirps/${id}/comments/${cid}`),
  getTimeline: () => apiCall('GET', '/timeline'),
  getUser: (id) => apiCall('GET', `/users/${id}`, null, false),
  updateUser: (id, data) => apiCall('PUT', `/users/${id}`, data),
  getUserByUsername: (u) => apiCall('GET', `/users/by-username/${u}`, null, false),
  getUserChirps: (id) => apiCall('GET', `/users/${id}/chirps`, null, false),
  getFollowing: (id) => apiCall('GET', `/users/${id}/following`, null, false),
  getFollowers: (id) => apiCall('GET', `/users/${id}/followers`, null, false),
  followUser: (id) => apiCall('POST', `/users/${id}/follow`, {}),
  unfollowUser: (id) => apiCall('DELETE', `/users/${id}/follow`),
};

// ── UI HELPERS ────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast hidden', 3000);
}
function showSection(s) {
  document.getElementById('auth-section').classList.toggle('hidden', s !== 'auth');
  document.getElementById('app-section').classList.toggle('hidden', s !== 'app');
  document.getElementById('auth-status').classList.toggle('hidden', s !== 'app');
}
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${id}`).classList.add('active');
  document.querySelector(`[data-view="${id}"]`).classList.add('active');
}
function fmt(iso) { return new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }); }
function showModal(title, html) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
}
function hideModal() { document.getElementById('modal').classList.add('hidden'); }
function authorHtml(chirp) {
  if (chirp.userId === state.userId) return `<strong>${state.displayName}</strong><span>@${state.username}</span>`;
  const c = userCache[chirp.userId];
  if (c) return `<strong>${c.displayName}</strong><span>@${c.username}</span>`;
  return `<strong>Usuario</strong><span>${chirp.userId.slice(0, 8)}…</span>`;
}

// ── RENDER CHIRP ──────────────────────────────────────────────────────────────
function renderChirp(chirp, container) {
  const isOwn = chirp.userId === state.userId;
  const div = document.createElement('div');
  div.className = 'chirp-card';
  div.innerHTML = `
    <div class="chirp-header">
      <div class="chirp-author">${authorHtml(chirp)}</div>
      <span class="chirp-date">${fmt(chirp.createdAt)}</span>
    </div>
    <div class="chirp-content">${chirp.content}${chirp.isHidden ? '<span class="hidden-badge">Oculto</span>' : ''}</div>
    <div class="chirp-actions">
      <button class="btn-icon btn-like">♥ <span>${chirp.likesCount || 0}</span></button>
      <button class="btn-icon btn-cmt">💬 <span>${chirp.commentsCount || 0}</span></button>
      <button class="btn-icon btn-showlikes">Ver likes</button>
      ${isOwn ? `<button class="btn-danger btn-hide">${chirp.isHidden ? 'Mostrar' : 'Ocultar'}</button>
                 <button class="btn-danger btn-del">Borrar</button>` : ''}
    </div>
    <div class="comments-section hidden"></div>`;

  let liked = false; let likeCount = chirp.likesCount || 0;
  const likeBtn = div.querySelector('.btn-like');
  likeBtn.addEventListener('click', async () => {
    if (liked) { await api.unlikeChirp(chirp.chirpId); liked = false; likeCount--; }
    else { await api.likeChirp(chirp.chirpId); liked = true; likeCount++; }
    likeBtn.classList.toggle('btn-liked', liked);
    likeBtn.querySelector('span').textContent = likeCount;
  });

  const cmtSection = div.querySelector('.comments-section');
  div.querySelector('.btn-cmt').addEventListener('click', async () => {
    if (!cmtSection.classList.contains('hidden')) { cmtSection.classList.add('hidden'); return; }
    cmtSection.classList.remove('hidden');
    if (!cmtSection.dataset.loaded) { await loadComments(chirp.chirpId, cmtSection); cmtSection.dataset.loaded = '1'; }
  });

  div.querySelector('.btn-showlikes').addEventListener('click', async () => {
    const data = await api.getChirpLikes(chirp.chirpId);
    const likes = data?.likes || [];
    showModal('❤️ Likes', likes.length
      ? likes.map(l => `<div class="like-item">❤️ ${l.userId.slice(0, 10)}…</div>`).join('')
      : '<p class="empty-msg">Sin likes aún</p>');
  });

  if (isOwn) {
    div.querySelector('.btn-hide').addEventListener('click', async () => {
      await api.hideChirp(chirp.chirpId); chirp.isHidden = !chirp.isHidden;
      div.querySelector('.btn-hide').textContent = chirp.isHidden ? 'Mostrar' : 'Ocultar';
      div.querySelector('.chirp-content').innerHTML = chirp.content + (chirp.isHidden ? '<span class="hidden-badge">Oculto</span>' : '');
      showToast('Chirp actualizado');
    });
    div.querySelector('.btn-del').addEventListener('click', async () => {
      if (!confirm('¿Eliminar este chirp?')) return;
      await api.deleteChirp(chirp.chirpId); div.remove(); showToast('Chirp eliminado');
    });
  }
  container.appendChild(div);
}


// ── LOAD COMMENTS ─────────────────────────────────────────────────────────────
async function loadComments(chirpId, section) {
  section.innerHTML = '';
  const data = await api.getChirpComments(chirpId);
  const comments = data?.comments || [];
  comments.forEach(c => addCommentEl(c, chirpId, section));
  const addRow = document.createElement('div');
  addRow.className = 'add-comment';
  addRow.innerHTML = `<input type="text" placeholder="Añade un comentario..."><button class="btn-primary">Enviar</button>`;
  addRow.querySelector('button').addEventListener('click', async () => {
    const inp = addRow.querySelector('input');
    const content = inp.value.trim(); if (!content) return;
    const res = await api.createComment(chirpId, content);
    if (res?.commentId) { inp.value = ''; addCommentEl(res, chirpId, section, addRow); showToast('Comentario añadido'); }
    else showToast('Error al comentar', 'error');
  });
  section.appendChild(addRow);
}
function addCommentEl(c, chirpId, section, before = null) {
  const div = document.createElement('div'); div.className = 'comment-card';
  div.innerHTML = `<div class="comment-header"><span>@${c.userId.slice(0,10)}…</span><span>${fmt(c.createdAt || new Date().toISOString())}</span></div>
    <div>${c.content}</div>
    ${c.userId === state.userId ? `<button class="btn-icon" style="font-size:11px">Borrar</button>` : ''}`;
  if (c.userId === state.userId)
    div.querySelector('button').addEventListener('click', async () => {
      await api.deleteComment(chirpId, c.commentId); div.remove(); showToast('Comentario eliminado');
    });
  before ? section.insertBefore(div, before) : section.appendChild(div);
}

// ── RENDER USER CARD ──────────────────────────────────────────────────────────
async function renderUserCard(user, container) {
  const isOwn = user.userId === state.userId;
  const card = document.createElement('div'); card.className = 'user-card';
  card.innerHTML = `
    <h2>${user.displayName}</h2><div class="uc-username">@${user.username}</div>
    ${user.bio ? `<div class="uc-bio">${user.bio}</div>` : ''}
    <div class="user-stats">
      <span><strong>${user.followingCount}</strong> Siguiendo</span>
      <span><strong>${user.followersCount}</strong> Seguidores</span>
    </div>
    ${!isOwn ? `<button class="btn-secondary btn-follow">…</button>` : ''}`;
  container.appendChild(card);
  if (!isOwn) {
    const btn = card.querySelector('.btn-follow');
    const fd = await api.getFollowing(state.userId);
    const already = (fd?.following || []).some(f => f.followedId === user.userId);
    btn.textContent = already ? 'Dejar de seguir' : 'Seguir';
    btn.dataset.f = already ? '1' : '';
    btn.addEventListener('click', async () => {
      if (btn.dataset.f) { await api.unfollowUser(user.userId); btn.textContent = 'Seguir'; btn.dataset.f = ''; showToast(`Dejaste de seguir a @${user.username}`); }
      else { await api.followUser(user.userId); btn.textContent = 'Dejar de seguir'; btn.dataset.f = '1'; showToast(`¡Ahora sigues a @${user.username}!`); }
    });
  }
  const title = document.createElement('div'); title.className = 'section-title';
  title.textContent = `Chirps de @${user.username}`; container.appendChild(title);
  const data = await api.getUserChirps(user.userId); const chirps = data?.chirps || [];
  if (!chirps.length) { const p = document.createElement('p'); p.className = 'empty-msg'; p.textContent = 'Sin chirps'; container.appendChild(p); }
  else chirps.forEach(c => renderChirp(c, container));
}

// ── AUTH HANDLERS ─────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const res = await api.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
  if (res?.accessToken) {
    state.token = res.accessToken; state.userId = res.userId;
    const user = await api.getUser(res.userId);
    state.username = user?.username; state.displayName = user?.displayName;
    if (state.userId) userCache[state.userId] = { username: state.username, displayName: state.displayName };
    saveState(); initApp(); showToast(`¡Bienvenido, ${state.displayName || state.username}!`);
  } else showToast(res?.message || 'Credenciales incorrectas', 'error');
}
async function handleRegister(e) {
  e.preventDefault();
  const res = await api.register(
    document.getElementById('reg-email').value, document.getElementById('reg-password').value,
    document.getElementById('reg-username').value, document.getElementById('reg-displayname').value
  );
  if (res?.userId) {
    showToast('¡Registro exitoso! Inicia sesión.');
    document.querySelector('[data-tab="login"]').click();
    document.getElementById('login-email').value = document.getElementById('reg-email').value;
  } else showToast(res?.message || 'Error al registrarse', 'error');
}
async function handleLogout() {
  try { await api.logout(); } catch (_) {}
  clearState(); showSection('auth'); showToast('Sesión cerrada');
}

// ── CHIRP / PROFILE / SEARCH ──────────────────────────────────────────────────
async function handleCreateChirp() {
  const content = document.getElementById('chirp-content').value.trim(); if (!content) return;
  const res = await api.createChirp(content);
  if (res?.chirpId) { document.getElementById('chirp-content').value = ''; document.getElementById('chirp-counter').textContent = '280'; showToast('¡Chirp publicado!'); loadTimeline(); }
  else showToast('Error al publicar', 'error');
}
async function loadTimeline() {
  const list = document.getElementById('timeline-list');
  list.innerHTML = '<p class="empty-msg">Cargando…</p>';
  const data = await api.getTimeline(); const chirps = data?.chirps || []; list.innerHTML = '';
  if (!chirps.length) { list.innerHTML = '<p class="empty-msg">Sin chirps. ¡Sigue a alguien o publica algo!</p>'; return; }
  chirps.forEach(c => renderChirp(c, list));
}
async function loadProfile() {
  const info = document.getElementById('profile-info');
  const user = await api.getUser(state.userId);
  if (user) {
    info.innerHTML = `<h2>${user.displayName}</h2><div class="uc-username">@${user.username}</div>
      ${user.bio ? `<div class="uc-bio">${user.bio}</div>` : ''}
      <div class="user-stats"><span><strong>${user.followingCount}</strong> Siguiendo</span><span><strong>${user.followersCount}</strong> Seguidores</span></div>`;
    document.getElementById('edit-displayname').value = user.displayName || '';
    document.getElementById('edit-bio').value = user.bio || '';
  }
  const list = document.getElementById('my-chirps-list'); list.innerHTML = '<p class="empty-msg">Cargando…</p>';
  const data = await api.getUserChirps(state.userId); const chirps = data?.chirps || []; list.innerHTML = '';
  if (!chirps.length) { list.innerHTML = '<p class="empty-msg">Aún no has publicado chirps</p>'; return; }
  chirps.forEach(c => renderChirp(c, list));
}
async function handleUpdateProfile() {
  const displayName = document.getElementById('edit-displayname').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  const res = await api.updateUser(state.userId, { displayName, bio });
  if (res) {
    state.displayName = displayName; saveState();
    if (state.userId) userCache[state.userId] = { username: state.username, displayName };
    document.getElementById('user-display').textContent = displayName;
    showToast('Perfil actualizado'); loadProfile();
  } else showToast('Error al actualizar', 'error');
}
async function handleSearch() {
  const username = document.getElementById('search-username').value.trim(); if (!username) return;
  const result = document.getElementById('search-result'); result.innerHTML = '';
  const user = await api.getUserByUsername(username);
  if (!user || user.message) { result.innerHTML = '<p class="empty-msg">Usuario no encontrado</p>'; return; }
  await renderUserCard(user, result);
}


// ── INIT ──────────────────────────────────────────────────────────────────────
function initApp() {
  document.getElementById('user-display').textContent = state.displayName || state.username;
  showSection('app');
  showView('timeline');
  loadTimeline();
}

function init() {
  loadState();

  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });

  // Forms
  document.getElementById('form-login').addEventListener('submit', handleLogin);
  document.getElementById('form-register').addEventListener('submit', handleRegister);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showView(btn.dataset.view);
      if (btn.dataset.view === 'profile') loadProfile();
      if (btn.dataset.view === 'search') document.getElementById('search-result').innerHTML = '';
    });
  });

  // Chirp
  document.getElementById('btn-create-chirp').addEventListener('click', handleCreateChirp);
  document.getElementById('chirp-content').addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') handleCreateChirp();
  });
  document.getElementById('chirp-content').addEventListener('input', e => {
    document.getElementById('chirp-counter').textContent = 280 - e.target.value.length;
  });

  // Profile
  document.getElementById('btn-update-profile').addEventListener('click', handleUpdateProfile);

  // Search
  document.getElementById('btn-search').addEventListener('click', handleSearch);
  document.getElementById('search-username').addEventListener('keydown', e => { if (e.key === 'Enter') handleSearch(); });

  // Modal
  document.getElementById('modal-close').addEventListener('click', hideModal);
  document.querySelector('.modal-overlay').addEventListener('click', hideModal);

  // Resume session
  if (state.token && state.userId) initApp();
  else showSection('auth');
}

document.addEventListener('DOMContentLoaded', init);
