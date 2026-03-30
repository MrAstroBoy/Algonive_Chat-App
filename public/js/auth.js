// ── Auth Page Logic ────────────────────────────────────────

let currentTab = 'login';

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  const indicator = document.getElementById('tab-indicator');
  indicator.classList.toggle('right', tab === 'register');
  clearErrors();
}

function clearErrors() {
  document.getElementById('login-error').classList.remove('visible');
  document.getElementById('reg-error').classList.remove('visible');
  document.getElementById('login-error').textContent = '';
  document.getElementById('reg-error').textContent = '';
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('visible');
}

function setLoading(btnId, loaderId, loading) {
  const btn = document.getElementById(btnId);
  const loader = btn.querySelector('.btn-loader');
  const text = btn.querySelector('.btn-text');
  btn.disabled = loading;
  loader.hidden = !loading;
  text.hidden = loading;
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function saveAndRedirect(data) {
  localStorage.setItem('nc_token', data.token);
  localStorage.setItem('nc_username', data.username);
  localStorage.setItem('nc_color', data.color);
  window.location.href = '/chat.html';
}

// If already logged in, redirect
if (localStorage.getItem('nc_token')) {
  window.location.href = '/chat.html';
}

// ── Login form ──
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) return showError('login-error', 'Please fill in all fields.');

  setLoading('login-btn', 'login-loader', true);
  try {
    const data = await apiPost('/api/login', { username, password });
    saveAndRedirect(data);
  } catch (err) {
    showError('login-error', err.message);
    setLoading('login-btn', 'login-loader', false);
  }
});

// ── Register form ──
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!username || !password) return showError('reg-error', 'Please fill in all fields.');

  setLoading('reg-btn', 'reg-loader', true);
  try {
    const data = await apiPost('/api/register', { username, password });
    saveAndRedirect(data);
  } catch (err) {
    showError('reg-error', err.message);
    setLoading('reg-btn', 'reg-loader', false);
  }
});

// Enter key submits
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const form = currentTab === 'login'
      ? document.getElementById('login-form')
      : document.getElementById('register-form');
    form.dispatchEvent(new Event('submit'));
  }
});
