// ── Chat Page Logic (DM-only + Friends) ──────────────────────

// ── Guard: redirect if not logged in ──
const token = localStorage.getItem('nc_token');
const myUsername = localStorage.getItem('nc_username');
const myColor = localStorage.getItem('nc_color');
if (!token || !myUsername) window.location.href = '/';

// ── State ──
let currentDM = null;       // Currently selected friend to chat with
let typingTimer = null;
let isTyping = false;
let typingUsers = new Set();
let lastMessageAuthor = null;

let friendsMap = new Map();         // username -> { username, color, online, unreadCount }
let pendingRequests = new Map();    // username -> { username, color }

// ── Socket ──
const socket = io({ auth: { token } });

socket.on('connect_error', (err) => {
  console.error('Auth failed:', err.message);
  localStorage.clear();
  window.location.href = '/';
});

// ── DOM refs ──
const messagesArea  = document.getElementById('messages-area');
const messagesList  = document.getElementById('messages-list');
const welcomeState  = document.getElementById('welcome-state');
const messageInput  = document.getElementById('message-input');
const sendBtn       = document.getElementById('send-btn');
const typingBar     = document.getElementById('typing-bar');
const typingText    = document.getElementById('typing-text');
const friendsList   = document.getElementById('friends-list');
const emptyFriends  = document.getElementById('empty-friends');
const chatTitle     = document.getElementById('chat-title');
const chatSubtitle  = document.getElementById('chat-subtitle');
const chatTitleInfo = document.getElementById('chat-title-info');
const chatPeerAvatar= document.getElementById('chat-peer-avatar');
const sidebar       = document.getElementById('sidebar');
const overlay       = document.getElementById('sidebar-overlay');
const myAvatar      = document.getElementById('my-avatar');
const myUsernameEl  = document.getElementById('my-username');
const notifDot      = document.getElementById('notif-dot');

const addFriendModal= document.getElementById('add-friend-modal');
const requestsModal = document.getElementById('requests-modal');
const searchInput   = document.getElementById('user-search-input');
const searchResults = document.getElementById('search-results');
const requestsList  = document.getElementById('requests-list');
const toastEl       = document.getElementById('toast');

// ── Initialize user profile ──
myAvatar.textContent = myUsername.charAt(0).toUpperCase();
myAvatar.style.background = myColor || '#6C63FF';
myUsernameEl.textContent = myUsername;
myUsernameEl.title = myUsername;

// ── Utilities ──
function makeAvatar(username, color, size = '') {
  const d = document.createElement('div');
  d.className = 'avatar ' + size;
  d.textContent = username.charAt(0).toUpperCase();
  d.style.background = color || '#6C63FF';
  return d;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function showToast(msg, type = 'success') {
  toastEl.textContent = msg;
  toastEl.className = `toast show ${type}`;
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// ── Modal Logic ──
document.getElementById('add-friend-btn').addEventListener('click', () => {
  addFriendModal.hidden = false;
  searchInput.value = '';
  searchResults.innerHTML = '<div class="search-hint">Type at least 2 characters to search</div>';
  setTimeout(() => searchInput.focus(), 100);
});
document.getElementById('welcome-add-btn').addEventListener('click', () => {
  addFriendModal.hidden = false;
  searchInput.focus();
});
document.getElementById('close-add-modal').addEventListener('click', () => addFriendModal.hidden = true);

document.getElementById('requests-btn').addEventListener('click', () => {
  requestsModal.hidden = false;
  renderRequests();
});
document.getElementById('close-requests-modal').addEventListener('click', () => requestsModal.hidden = true);

// Close modals on clicking outside
window.addEventListener('click', (e) => {
  if (e.target === addFriendModal) addFriendModal.hidden = true;
  if (e.target === requestsModal) requestsModal.hidden = true;
});

// ── Render Friends List ──
function renderFriends() {
  friendsList.innerHTML = '';
  const friendsArray = Array.from(friendsMap.values());
  if (friendsArray.length === 0) {
    emptyFriends.style.display = 'flex';
    return;
  }
  emptyFriends.style.display = 'none';

  // Sort: online first, then alphabetical
  friendsArray.sort((a, b) => {
    if (a.online === b.online) return a.username.localeCompare(b.username);
    return a.online ? -1 : 1;
  });

  friendsArray.forEach(f => {
    const li = document.createElement('li');
    li.className = 'nav-item' + (currentDM === f.username ? ' active' : '');
    li.id = `friend-${f.username}`;

    const avatar = makeAvatar(f.username, f.color);

    const meta = document.createElement('div');
    meta.className = 'nav-meta';
    
    const nameStr = document.createElement('div');
    nameStr.className = 'nav-name';
    nameStr.textContent = f.username;
    
    const preview = document.createElement('div');
    preview.className = 'nav-preview';
    preview.textContent = f.online ? 'Online' : 'Offline';
    
    meta.appendChild(nameStr);
    meta.appendChild(preview);

    const statusPill = document.createElement('div');
    statusPill.className = f.online ? 'online-pill' : 'offline-pill';

    li.appendChild(avatar);
    li.appendChild(meta);

    if (f.unreadCount > 0 && currentDM !== f.username) {
      const unread = document.createElement('div');
      unread.className = 'unread-badge';
      unread.textContent = f.unreadCount;
      li.appendChild(unread);
    } else {
      li.appendChild(statusPill);
    }

    li.addEventListener('click', () => openDM(f.username));
    friendsList.appendChild(li);
  });
}

function updateFriendUnread(username) {
  if (currentDM === username) return; // don't increment if open
  const f = friendsMap.get(username);
  if (f) {
    f.unreadCount = (f.unreadCount || 0) + 1;
    renderFriends();
  }
}

// ── Render Requests ──
function renderRequests() {
  requestsList.innerHTML = '';
  if (pendingRequests.size === 0) {
    requestsList.innerHTML = '<div class="empty-state-small">No pending requests</div>';
    notifDot.hidden = true;
    return;
  }
  
  notifDot.hidden = false;
  
  pendingRequests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.innerHTML = `
      <div class="avatar" style="background:${req.color}">${req.username.charAt(0).toUpperCase()}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${req.username}</div>
        <div style="font-size:12px; color:var(--text-dim)">wants to chat</div>
      </div>
      <div class="req-actions">
        <button class="btn-accept" data-user="${req.username}">Accept</button>
        <button class="btn-reject" data-user="${req.username}">Decline</button>
      </div>
    `;
    requestsList.appendChild(card);
  });

  // Attach listeners
  requestsList.querySelectorAll('.btn-accept').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const user = e.target.dataset.user;
      socket.emit('accept-friend-request', { fromUsername: user });
    });
  });
  requestsList.querySelectorAll('.btn-reject').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const user = e.target.dataset.user;
      socket.emit('reject-friend-request', { fromUsername: user });
    });
  });
}

// ── Search API Logic ──
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if (q.length < 2) {
    searchResults.innerHTML = '<div class="search-hint">Type at least 2 characters to search</div>';
    return;
  }
  searchResults.innerHTML = '<div class="search-hint">Searching...</div>';
  
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Search failed');
      const users = await res.json();
      renderSearchResults(users);
    } catch (err) {
      searchResults.innerHTML = '<div class="search-hint" style="color:var(--error)">Failed to search</div>';
    }
  }, 300);
});

function renderSearchResults(users) {
  searchResults.innerHTML = '';
  if (users.length === 0) {
    searchResults.innerHTML = '<div class="search-hint">No users found</div>';
    return;
  }
  
  users.forEach(u => {
    const card = document.createElement('div');
    card.className = 'person-card';
    
    let actionHtml = '';
    if (u.isFriend) {
      actionHtml = '<span class="tag-friends">Friends</span>';
    } else if (u.requestReceived) {
      actionHtml = `<button class="tag-accept" onclick="acceptFromSearch('${u.username}')">Accept Request</button>`;
    } else if (u.requestSent) {
      actionHtml = '<span class="tag-pending">Pending</span>';
    } else {
      actionHtml = `<button class="btn-send-req" onclick="sendReq('${u.username}', this)">Add Friend</button>`;
    }

    card.innerHTML = `
      <div class="avatar" style="background:${u.color}">${u.username.charAt(0).toUpperCase()}</div>
      <div class="person-info">
        <div class="person-name">${u.username}</div>
        <div class="person-tag">NexChat User</div>
      </div>
      <div>${actionHtml}</div>
    `;
    searchResults.appendChild(card);
  });
}

// Global scope for onclick
window.sendReq = function(username, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = 'Sending...';
  socket.emit('send-friend-request', { toUsername: username });
};
window.acceptFromSearch = function(username) {
  socket.emit('accept-friend-request', { fromUsername: username });
  addFriendModal.hidden = true;
};

// ── Render Message ──
function renderMessage(msg) {
  const isMe = msg.from === myUsername;
  const author = isMe ? msg.from : msg.to;

  const el = document.createElement('div');
  el.className = 'message ' + (isMe ? 'sent' : 'received');

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = msg.text;

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = formatTime(msg.timestamp);

  el.appendChild(bubble);
  el.appendChild(time);
  messagesList.appendChild(el);
  
  lastMessageAuthor = msg.from;
  scrollToBottom();
}

function clearMessages() {
  messagesList.innerHTML = '';
  lastMessageAuthor = null;
}

// ── Open DM ──
function openDM(username) {
  if (currentDM === username) return;
  currentDM = username;
  
  const f = friendsMap.get(username);
  if (f) {
    f.unreadCount = 0;
    renderFriends();
  }

  // Update header
  chatTitleInfo.hidden = false;
  chatTitle.textContent = username;
  chatSubtitle.textContent = f?.online ? 'Online' : 'Offline';
  chatPeerAvatar.textContent = username.charAt(0).toUpperCase();
  chatPeerAvatar.style.background = f?.color || '#6C63FF';

  clearMessages();
  typingUsers.clear();
  hideTyping();
  welcomeState.style.display = 'none';

  messageInput.disabled = false;
  sendBtn.disabled = false;
  messageInput.placeholder = `Message ${username}…`;
  messageInput.focus();

  closeSidebar();

  socket.emit('load-dm-history', { withUsername: username });
}

// ── Send message ──
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentDM) return;

  socket.emit('private-message', { toUsername: currentDM, text });
  
  messageInput.value = '';
  messageInput.style.height = 'auto'; // reset resize
  stopTypingSignal();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 130) + 'px';
});

// ── Typing indicator ──
messageInput.addEventListener('input', () => {
  if (!currentDM) return;
  if (!isTyping) {
    isTyping = true;
    socket.emit('private-typing', { toUsername: currentDM });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTypingSignal, 2000);
});
function stopTypingSignal() {
  if (!isTyping || !currentDM) return;
  isTyping = false;
  clearTimeout(typingTimer);
  socket.emit('private-stop-typing', { toUsername: currentDM });
}

function showTyping() {
  if (typingUsers.size === 0) { hideTyping(); return; }
  typingBar.hidden = false;
  const names = Array.from(typingUsers);
  typingText.textContent = names.length === 1 ? `${names[0]} is typing…` : `${names.join(', ')} are typing…`;
}
function hideTyping() { typingBar.hidden = true; }

// ════════ SOCKET EVENTS ════════

socket.on('init', (data) => {
  data.friends.forEach(f => {
    f.unreadCount = 0;
    friendsMap.set(f.username, f);
  });
  data.pendingRequests.forEach(req => pendingRequests.set(req.username, req));
  renderFriends();
  renderRequests();
});

socket.on('error-msg', (msg) => showToast(msg, 'error'));

// ── Friend Requests ──
socket.on('new-friend-request', (req) => {
  pendingRequests.set(req.username, req);
  renderRequests();
  showToast(`New friend request from ${req.username}`);
});

socket.on('request-sent', ({ toUsername }) => {
  showToast(`Friend request sent to ${toUsername}`);
  // If search modal is open, trigger re-search to update button states
  if (!addFriendModal.hidden) searchInput.dispatchEvent(new Event('input'));
});

socket.on('friend-added', (friend) => {
  friend.unreadCount = 0;
  friendsMap.set(friend.username, friend);
  renderFriends();
  showToast(`You and ${friend.username} are now friends!`);
  if (!addFriendModal.hidden) searchInput.dispatchEvent(new Event('input'));
});

socket.on('request-removed', ({ fromUsername }) => {
  pendingRequests.delete(fromUsername);
  renderRequests();
});

// ── Presence ──
socket.on('friend-online', ({ username, online }) => {
  const f = friendsMap.get(username);
  if (f) {
    f.online = online;
    renderFriends();
    if (currentDM === username) {
      chatSubtitle.textContent = online ? 'Online' : 'Offline';
    }
  }
});

// ── Messages ──
socket.on('dm-history', ({ withUsername, messages }) => {
  if (withUsername !== currentDM) return;
  clearMessages();
  messages.forEach(m => renderMessage(m));
  scrollToBottom();
});

socket.on('new-private-message', (msg) => {
  const other = msg.from === myUsername ? msg.to : msg.from;
  
  if (other === currentDM) {
    renderMessage(msg);
  } else if (msg.from !== myUsername) {
    // Received message from someone else
    updateFriendUnread(msg.from);
    showToast(`New message from ${msg.from}`);
  }
});

// ── Typing ──
socket.on('private-user-typing', ({ username }) => {
  if (username !== currentDM) return;
  typingUsers.add(username);
  showTyping();
});
socket.on('private-user-stop-typing', ({ username }) => {
  typingUsers.delete(username);
  showTyping();
});

// ── Mobile Sidebar ──
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
});
overlay.addEventListener('click', closeSidebar);
function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}

// ── Logout ──
document.getElementById('logout-btn').addEventListener('click', () => {
  socket.disconnect();
  localStorage.clear();
  window.location.href = '/';
});
