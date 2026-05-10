// ── SMITHY TYPE IMPORTS ────────────────────────────────────────────────────────
// Type-only imports from the generated Smithy client models.
// These are fully erased by esbuild at bundle time — zero runtime overhead.
// Path resolves from the CDK repo root (where smithy/ and frontend/ are siblings).
//
// NOTE: Two intentional discrepancies between the Smithy spec and Lambda reality:
//   1. Chirp.hidden (Smithy) → isHidden (DynamoDB field returned by Lambda)
//   2. GetUserOutput.user (Smithy wraps) → Lambda returns the User object flat
import type {
  Chirp,
  Comment,
  User,
  Follow,
  LoginOutput,
  RegisterOutput,
} from '../../smithy/generated/source/typescript-client-codegen/src/models/models_0';

// ── RUNTIME TYPE ADAPTERS ──────────────────────────────────────────────────────
// Map each Smithy type to the actual shape returned by the Lambda handlers.

/** Lambda uses `isHidden`; Smithy spec uses `hidden`. createdAt comes as ISO string. */
type ApiChirp = Omit<Chirp, 'hidden' | 'createdAt'> & {
  isHidden?: boolean;
  createdAt: string;
};

/** Lambda returns User flat (not wrapped in { user }). createdAt comes as ISO string. */
type ApiUser = Omit<User, 'createdAt'> & { createdAt?: string };

/** Login response adds `userId` and optional `message` beyond the Smithy spec. */
type ApiLoginOutput = LoginOutput & { userId?: string; message?: string };

/** createdAt comes as ISO string from DynamoDB. */
type ApiComment = Omit<Comment, 'createdAt'> & { createdAt?: string };
type ApiFollow  = Omit<Follow,  'createdAt'> & { createdAt?: string };

// ── GLOBAL WINDOW AUGMENTATION ─────────────────────────────────────────────────
declare global {
  interface Window { RUNTIME_CONFIG?: { apiUrl: string }; }
}

// ── CONFIG ─────────────────────────────────────────────────────────────────────
const API_URL = (window.RUNTIME_CONFIG?.apiUrl ?? '').replace(/\/$/, '');

// ── STATE ──────────────────────────────────────────────────────────────────────
interface AppState {
  token: string | null;
  userId: string | null;
  username: string | null;
  displayName: string | null;
}
interface UserCacheEntry { username: string; displayName: string; }

let state: AppState = { token: null, userId: null, username: null, displayName: null };
const userCache: Record<string, UserCacheEntry> = {};

function loadState(): void {
  const s = localStorage.getItem('chirp_state');
  if (s) {
    state = JSON.parse(s) as AppState;
    if (state.userId && state.username && state.displayName) {
      userCache[state.userId] = { username: state.username, displayName: state.displayName };
    }
  }
}
function saveState(): void { localStorage.setItem('chirp_state', JSON.stringify(state)); }
function clearState(): void { state = { token: null, userId: null, username: null, displayName: null }; localStorage.removeItem('chirp_state'); }

// ── API HELPER ─────────────────────────────────────────────────────────────────
async function apiCall<T>(method: string, path: string, body: unknown = null, auth = true): Promise<T | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(`${API_URL}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (res.status === 204) return null;
    return res.json() as Promise<T>;
  } catch { showToast('Error de conexión', 'error'); return null; }
}

// ── API ────────────────────────────────────────────────────────────────────────
const api = {
  register:         (e: string, p: string, u: string, d: string) =>
                      apiCall<RegisterOutput>('POST', '/auth/register', { email: e, password: p, username: u, displayName: d }, false),
  login:            (e: string, p: string) =>
                      apiCall<ApiLoginOutput>('POST', '/auth/login', { email: e, password: p }, false),
  logout:           () => apiCall<void>('POST', '/auth/logout', {}),
  createChirp:      (content: string) => apiCall<{ chirpId: string }>('POST', '/chirps', { content }),
  deleteChirp:      (id: string) => apiCall<void>('DELETE', `/chirps/${id}`),
  hideChirp:        (id: string) => apiCall<void>('POST', `/chirps/${id}/hide`, {}),
  likeChirp:        (id: string) => apiCall<void>('POST', `/chirps/${id}/like`, {}),
  unlikeChirp:      (id: string) => apiCall<void>('DELETE', `/chirps/${id}/like`),
  getChirpLikes:    (id: string) => apiCall<{ likes: { userId: string }[] }>('GET', `/chirps/${id}/likes`, null, false),
  getChirpComments: (id: string) => apiCall<{ comments: ApiComment[] }>('GET', `/chirps/${id}/comments`, null, false),
  createComment:    (id: string, content: string) => apiCall<ApiComment>('POST', `/chirps/${id}/comments`, { content }),
  deleteComment:    (id: string, cid: string) => apiCall<void>('DELETE', `/chirps/${id}/comments/${cid}`),
  getTimeline:      () => apiCall<{ chirps: ApiChirp[] }>('GET', '/timeline'),
  getUser:          (id: string) => apiCall<ApiUser>('GET', `/users/${id}`, null, false),
  updateUser:       (id: string, data: { displayName?: string; bio?: string }) => apiCall<ApiUser>('PUT', `/users/${id}`, data),
  getUserByUsername:(u: string) => apiCall<ApiUser>('GET', `/users/by-username/${u}`, null, false),
  getUserChirps:    (id: string) => apiCall<{ chirps: ApiChirp[] }>('GET', `/users/${id}/chirps`, null, false),
  getFollowing:     (id: string) => apiCall<{ following: ApiFollow[] }>('GET', `/users/${id}/following`, null, false),
  getFollowers:     (id: string) => apiCall<{ followers: ApiFollow[] }>('GET', `/users/${id}/followers`, null, false),
  followUser:       (id: string) => apiCall<void>('POST', `/users/${id}/follow`, {}),
  unfollowUser:     (id: string) => apiCall<void>('DELETE', `/users/${id}/follow`),
};


// ── UI HELPERS ─────────────────────────────────────────────────────────────────
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(msg: string, type: 'success' | 'error' = 'success'): void {
  const t = document.getElementById('toast')!;
  t.textContent = msg; t.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast hidden'; }, 3000);
}
function showSection(s: 'auth' | 'app'): void {
  document.getElementById('auth-section')!.classList.toggle('hidden', s !== 'auth');
  document.getElementById('app-section')!.classList.toggle('hidden', s !== 'app');
  document.getElementById('auth-status')!.classList.toggle('hidden', s !== 'app');
}
function showView(id: string): void {
  document.querySelectorAll<HTMLElement>('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll<HTMLElement>('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${id}`)!.classList.add('active');
  document.querySelector<HTMLElement>(`[data-view="${id}"]`)!.classList.add('active');
}
function fmt(iso: string | Date | undefined): string {
  return new Date(iso as string).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
}
function showModal(title: string, html: string): void {
  document.getElementById('modal-title')!.textContent = title;
  document.getElementById('modal-body')!.innerHTML = html;
  document.getElementById('modal')!.classList.remove('hidden');
}
function hideModal(): void { document.getElementById('modal')!.classList.add('hidden'); }

function authorHtml(chirp: ApiChirp): string {
  if (chirp.userId === state.userId) return `<strong>${state.displayName}</strong><span>@${state.username}</span>`;
  const c = userCache[chirp.userId as string];
  if (c) return `<strong>${c.displayName}</strong><span>@${c.username}</span>`;
  return `<strong>Usuario</strong><span>${(chirp.userId as string).slice(0, 8)}…</span>`;
}

// ── RENDER CHIRP ───────────────────────────────────────────────────────────────
function renderChirp(chirp: ApiChirp, container: HTMLElement): void {
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
      <button class="btn-icon btn-like">♥ <span>${chirp.likesCount ?? 0}</span></button>
      <button class="btn-icon btn-cmt">💬 <span>${chirp.commentsCount ?? 0}</span></button>
      <button class="btn-icon btn-showlikes">Ver likes</button>
      ${isOwn ? `<button class="btn-danger btn-hide">${chirp.isHidden ? 'Mostrar' : 'Ocultar'}</button>
                 <button class="btn-danger btn-del">Borrar</button>` : ''}
    </div>
    <div class="comments-section hidden"></div>`;

  let liked = false; let likeCount = chirp.likesCount ?? 0;
  const likeBtn = div.querySelector<HTMLButtonElement>('.btn-like')!;
  likeBtn.addEventListener('click', async () => {
    if (liked) { await api.unlikeChirp(chirp.chirpId as string); liked = false; likeCount--; }
    else        { await api.likeChirp(chirp.chirpId as string);   liked = true;  likeCount++; }
    likeBtn.classList.toggle('btn-liked', liked);
    likeBtn.querySelector('span')!.textContent = String(likeCount);
  });

  const cmtSection = div.querySelector<HTMLElement>('.comments-section')!;
  div.querySelector('.btn-cmt')!.addEventListener('click', async () => {
    if (!cmtSection.classList.contains('hidden')) { cmtSection.classList.add('hidden'); return; }
    cmtSection.classList.remove('hidden');
    if (!cmtSection.dataset.loaded) { await loadComments(chirp.chirpId as string, cmtSection); cmtSection.dataset.loaded = '1'; }
  });

  div.querySelector('.btn-showlikes')!.addEventListener('click', async () => {
    const data = await api.getChirpLikes(chirp.chirpId as string);
    const likes = data?.likes ?? [];
    showModal('❤️ Likes', likes.length
      ? likes.map(l => `<div class="like-item">❤️ ${l.userId.slice(0, 10)}…</div>`).join('')
      : '<p class="empty-msg">Sin likes aún</p>');
  });

  if (isOwn) {
    div.querySelector('.btn-hide')!.addEventListener('click', async () => {
      await api.hideChirp(chirp.chirpId as string);
      chirp.isHidden = !chirp.isHidden;
      div.querySelector<HTMLButtonElement>('.btn-hide')!.textContent = chirp.isHidden ? 'Mostrar' : 'Ocultar';
      div.querySelector<HTMLElement>('.chirp-content')!.innerHTML =
        (chirp.content as string) + (chirp.isHidden ? '<span class="hidden-badge">Oculto</span>' : '');
      showToast('Chirp actualizado');
    });
    div.querySelector('.btn-del')!.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este chirp?')) return;
      await api.deleteChirp(chirp.chirpId as string); div.remove(); showToast('Chirp eliminado');
    });
  }
  container.appendChild(div);
}


// ── COMMENTS ───────────────────────────────────────────────────────────────────
async function loadComments(chirpId: string, section: HTMLElement): Promise<void> {
  section.innerHTML = '';
  const data = await api.getChirpComments(chirpId);
  const comments = data?.comments ?? [];
  await resolveUsers(comments);
  comments.forEach(c => addCommentEl(c, chirpId, section));
  const addRow = document.createElement('div');
  addRow.className = 'add-comment';
  addRow.innerHTML = `<input type="text" placeholder="Añade un comentario..."><button class="btn-primary">Enviar</button>`;
  addRow.querySelector('button')!.addEventListener('click', async () => {
    const inp = addRow.querySelector<HTMLInputElement>('input')!;
    const content = inp.value.trim(); if (!content) return;
    const res = await api.createComment(chirpId, content);
    if (res?.commentId) { inp.value = ''; addCommentEl(res, chirpId, section, addRow); showToast('Comentario añadido'); }
    else showToast('Error al comentar', 'error');
  });
  section.appendChild(addRow);
}
function commentAuthor(userId: string): string {
  if (userId === state.userId) return `<strong>${state.displayName}</strong> <span>@${state.username}</span>`;
  const c = userCache[userId];
  if (c) return `<strong>${c.displayName}</strong> <span>@${c.username}</span>`;
  return `<span>@${userId.slice(0, 10)}…</span>`;
}
function addCommentEl(c: ApiComment, chirpId: string, section: HTMLElement, before: Element | null = null): void {
  const div = document.createElement('div'); div.className = 'comment-card';
  div.innerHTML = `<div class="comment-header"><span>${commentAuthor(c.userId as string)}</span><span>${fmt(c.createdAt ?? new Date().toISOString())}</span></div>
    <div>${c.content}</div>
    ${c.userId === state.userId ? `<button class="btn-icon" style="font-size:11px">Borrar</button>` : ''}`;
  if (c.userId === state.userId)
    div.querySelector('button')!.addEventListener('click', async () => {
      await api.deleteComment(chirpId, c.commentId as string); div.remove(); showToast('Comentario eliminado');
    });
  before ? section.insertBefore(div, before) : section.appendChild(div);
}

// ── RENDER USER CARD ───────────────────────────────────────────────────────────
async function renderUserCard(user: ApiUser, container: HTMLElement): Promise<void> {
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
    const btn = card.querySelector<HTMLButtonElement>('.btn-follow')!;
    const fd = await api.getFollowing(state.userId as string);
    const already = (fd?.following ?? []).some(f => f.followedId === user.userId);
    btn.textContent = already ? 'Dejar de seguir' : 'Seguir';
    btn.dataset.f = already ? '1' : '';
    btn.addEventListener('click', async () => {
      if (btn.dataset.f) { await api.unfollowUser(user.userId as string); btn.textContent = 'Seguir'; btn.dataset.f = ''; showToast(`Dejaste de seguir a @${user.username}`); }
      else                { await api.followUser(user.userId as string);   btn.textContent = 'Dejar de seguir'; btn.dataset.f = '1'; showToast(`¡Ahora sigues a @${user.username}!`); }
    });
  }
  const title = document.createElement('div'); title.className = 'section-title';
  title.textContent = `Chirps de @${user.username}`; container.appendChild(title);
  const data = await api.getUserChirps(user.userId as string); const chirps = data?.chirps ?? [];
  if (!chirps.length) { const p = document.createElement('p'); p.className = 'empty-msg'; p.textContent = 'Sin chirps'; container.appendChild(p); }
  else chirps.forEach(c => renderChirp(c, container));
}

// ── AUTH HANDLERS ──────────────────────────────────────────────────────────────
async function handleLogin(e: Event): Promise<void> {
  e.preventDefault();
  const res = await api.login(
    (document.getElementById('login-email') as HTMLInputElement).value,
    (document.getElementById('login-password') as HTMLInputElement).value,
  );
  if (res?.accessToken) {
    state.token = res.accessToken as string; state.userId = res.userId as string;
    const user = await api.getUser(res.userId as string);
    state.username = user?.username ?? null; state.displayName = user?.displayName ?? null;
    if (state.userId && state.username && state.displayName)
      userCache[state.userId] = { username: state.username, displayName: state.displayName };
    saveState(); initApp(); showToast(`¡Bienvenido, ${state.displayName ?? state.username}!`);
  } else showToast(res?.message ?? 'Credenciales incorrectas', 'error');
}
async function handleRegister(e: Event): Promise<void> {
  e.preventDefault();
  const res = await api.register(
    (document.getElementById('reg-email') as HTMLInputElement).value,
    (document.getElementById('reg-password') as HTMLInputElement).value,
    (document.getElementById('reg-username') as HTMLInputElement).value,
    (document.getElementById('reg-displayname') as HTMLInputElement).value,
  );
  if (res?.userId) {
    showToast('¡Registro exitoso! Inicia sesión.');
    (document.querySelector('[data-tab="login"]') as HTMLButtonElement).click();
    (document.getElementById('login-email') as HTMLInputElement).value =
      (document.getElementById('reg-email') as HTMLInputElement).value;
  } else showToast((res as unknown as { message?: string })?.message ?? 'Error al registrarse', 'error');
}
async function handleLogout(): Promise<void> {
  try { await api.logout(); } catch (_) {}
  clearState(); showSection('auth'); showToast('Sesión cerrada');
}


// ── CHIRP / PROFILE / SEARCH ───────────────────────────────────────────────────
async function handleCreateChirp(): Promise<void> {
  const ta = document.getElementById('chirp-content') as HTMLTextAreaElement;
  const content = ta.value.trim(); if (!content) return;
  const res = await api.createChirp(content);
  if (res?.chirpId) { ta.value = ''; (document.getElementById('chirp-counter') as HTMLElement).textContent = '280'; showToast('¡Chirp publicado!'); loadTimeline(); }
  else showToast('Error al publicar', 'error');
}
async function resolveUsers(items: Array<{ userId?: string | undefined }>): Promise<void> {
  const unknownIds = [...new Set(items.map(c => c.userId).filter((id): id is string => !!id && id !== state.userId && !userCache[id]))];
  await Promise.all(unknownIds.map(async id => {
    const user = await api.getUser(id);
    if (user?.username && user?.displayName) userCache[id] = { username: user.username, displayName: user.displayName };
  }));
}
async function loadTimeline(): Promise<void> {
  const list = document.getElementById('timeline-list') as HTMLElement;
  list.innerHTML = '<p class="empty-msg">Cargando…</p>';
  const data = await api.getTimeline(); const chirps = data?.chirps ?? []; list.innerHTML = '';
  if (!chirps.length) { list.innerHTML = '<p class="empty-msg">Sin chirps. ¡Sigue a alguien o publica algo!</p>'; return; }
  await resolveUsers(chirps);
  chirps.forEach(c => renderChirp(c, list));
}
async function loadProfile(): Promise<void> {
  const info = document.getElementById('profile-info') as HTMLElement;
  const user = await api.getUser(state.userId as string);
  if (user) {
    info.innerHTML = `<h2>${user.displayName}</h2><div class="uc-username">@${user.username}</div>
      ${user.bio ? `<div class="uc-bio">${user.bio}</div>` : ''}
      <div class="user-stats"><span><strong>${user.followingCount}</strong> Siguiendo</span><span><strong>${user.followersCount}</strong> Seguidores</span></div>`;
    (document.getElementById('edit-displayname') as HTMLInputElement).value = user.displayName ?? '';
    (document.getElementById('edit-bio') as HTMLInputElement).value = user.bio ?? '';
  }
  const list = document.getElementById('my-chirps-list') as HTMLElement; list.innerHTML = '<p class="empty-msg">Cargando…</p>';
  const data = await api.getUserChirps(state.userId as string); const chirps = data?.chirps ?? []; list.innerHTML = '';
  if (!chirps.length) { list.innerHTML = '<p class="empty-msg">Aún no has publicado chirps</p>'; return; }
  chirps.forEach(c => renderChirp(c, list));
}
async function handleUpdateProfile(): Promise<void> {
  const displayName = (document.getElementById('edit-displayname') as HTMLInputElement).value.trim();
  const bio = (document.getElementById('edit-bio') as HTMLInputElement).value.trim();
  const res = await api.updateUser(state.userId as string, { displayName, bio });
  if (res) {
    state.displayName = displayName; saveState();
    if (state.userId && state.username) userCache[state.userId] = { username: state.username, displayName };
    (document.getElementById('user-display') as HTMLElement).textContent = displayName;
    showToast('Perfil actualizado'); loadProfile();
  } else showToast('Error al actualizar', 'error');
}
async function handleSearch(): Promise<void> {
  const username = (document.getElementById('search-username') as HTMLInputElement).value.trim(); if (!username) return;
  const result = document.getElementById('search-result') as HTMLElement; result.innerHTML = '';
  const user = await api.getUserByUsername(username);
  if (!user || (user as unknown as { message?: string }).message) { result.innerHTML = '<p class="empty-msg">Usuario no encontrado</p>'; return; }
  await renderUserCard(user, result);
}

// ── INIT ───────────────────────────────────────────────────────────────────────
function initApp(): void {
  (document.getElementById('user-display') as HTMLElement).textContent = state.displayName ?? state.username ?? '';
  showSection('app');
  showView('timeline');
  loadTimeline();
}

function init(): void {
  loadState();

  // Auth tabs
  document.querySelectorAll<HTMLElement>('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`)!.classList.remove('hidden');
    });
  });

  // Forms
  document.getElementById('form-login')!.addEventListener('submit', handleLogin);
  document.getElementById('form-register')!.addEventListener('submit', handleRegister);
  document.getElementById('btn-logout')!.addEventListener('click', handleLogout);

  // Nav
  document.querySelectorAll<HTMLElement>('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showView(btn.dataset.view as string);
      if (btn.dataset.view === 'profile') loadProfile();
      if (btn.dataset.view === 'search') (document.getElementById('search-result') as HTMLElement).innerHTML = '';
    });
  });

  // Refresh timeline
  const refreshBtn = document.getElementById('btn-refresh-timeline') as HTMLButtonElement;
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true; refreshBtn.style.opacity = '0.6';
    await loadTimeline();
    refreshBtn.disabled = false; refreshBtn.style.opacity = '1';
  });

  // Chirp
  document.getElementById('btn-create-chirp')!.addEventListener('click', handleCreateChirp);
  const ta = document.getElementById('chirp-content') as HTMLTextAreaElement;
  ta.addEventListener('keydown', (e: KeyboardEvent) => { if (e.ctrlKey && e.key === 'Enter') handleCreateChirp(); });
  ta.addEventListener('input', () => { (document.getElementById('chirp-counter') as HTMLElement).textContent = String(280 - ta.value.length); });

  // Profile
  document.getElementById('btn-update-profile')!.addEventListener('click', handleUpdateProfile);

  // Search
  document.getElementById('btn-search')!.addEventListener('click', handleSearch);
  (document.getElementById('search-username') as HTMLInputElement).addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); });

  // Modal
  document.getElementById('modal-close')!.addEventListener('click', hideModal);
  document.querySelector('.modal-overlay')!.addEventListener('click', hideModal);

  // Resume session
  if (state.token && state.userId) initApp();
  else showSection('auth');
}

document.addEventListener('DOMContentLoaded', init);
