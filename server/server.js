require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');

const auth = require('./auth');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Colors for avatars
const AVATAR_COLORS = ['#6C63FF', '#43CBFF', '#FF6584', '#FFB84C', '#4ade80'];
const getRandomColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

// ── REST Endpoints ──

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  try {
    const existing = await db.getUser(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const color = getRandomColor();
    const newUser = await db.addUser(username, hash, color);
    
    const token = auth.generateToken(username);
    res.json({ token, username, color });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error ' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.getUser(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = auth.generateToken(user.username);
    res.json({ token, username: user.username, color: user.color });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Search API
app.get('/api/users/search', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) return res.json([]);

  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  
  const token = authHeader.split(' ')[1];
  const decoded = auth.verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });

  try {
    // Basic search excluding self
    const matchUsers = await db.searchUsers(q, decoded.username);
    
    // Determine relationship status for each returned user
    const results = [];
    
    for (const u of matchUsers) {
      // Is friend?
      const isFriend = await db.isFriend(decoded.username, u.username);
      
      // Is pending req sent by me?
      const reqsSent = await db.getSentRequestsByUser(decoded.username);
      const isReqSent = reqsSent.some(r => r.username === u.username);

      // Is pending req received by me?
      const reqsRecv = await db.getPendingRequestsForUser(decoded.username);
      const isReqRecv = reqsRecv.some(r => r.username === u.username);

      results.push({
        username: u.username,
        color: u.color,
        isFriend,
        requestSent: isReqSent,
        requestReceived: isReqRecv
      });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Socket.IO ──

// Track online users locally for presence
const onlineUsers = new Map(); // username -> socket.id

// Middleware to protect sockets
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication failed'));
  
  const decoded = auth.verifyToken(token);
  if (!decoded) return next(new Error('Authentication failed'));
  
  socket.username = decoded.username;
  next();
});

io.on('connection', async (socket) => {
  const username = socket.username;
  onlineUsers.set(username, socket.id);

  console.log(`[+] ${username} connected (${socket.id})`);

  try {
    // Emit initial state
    const friends = await db.getFriends(username);
    const pendingReqs = await db.getPendingRequestsForUser(username);
    
    // Add online status to friends array
    const friendsWithStatus = friends.map(f => ({
      ...f,
      online: onlineUsers.has(f.username)
    }));

    socket.emit('init', {
      friends: friendsWithStatus,
      pendingRequests: pendingReqs
    });

    // Notify friends that I'm online
    friends.forEach(f => {
      const friendSocketId = onlineUsers.get(f.username);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend-online', { username, online: true });
      }
    });

  } catch (err) {
    console.error('Socket init error:', err);
  }

  // Handle Friend Requests
  socket.on('send-friend-request', async ({ toUsername }) => {
    try {
      if (toUsername === username) return socket.emit('error-msg', "Cannot add yourself");
      
      const targetUser = await db.getUser(toUsername);
      if (!targetUser) return socket.emit('error-msg', "User not found");
      
      const isAlreadyFriend = await db.isFriend(username, toUsername);
      if (isAlreadyFriend) return socket.emit('error-msg', "Already friends");

      // Add to db
      const added = await db.addFriendRequest(username, toUsername);
      if (!added) return socket.emit('error-msg', "Request already pending");

      const meUser = await db.getUser(username);

      // Notify target if online
      const targetSocketId = onlineUsers.get(toUsername);
      if (targetSocketId) {
        io.to(targetSocketId).emit('new-friend-request', {
          username: username,
          color: meUser.color
        });
      }

      socket.emit('request-sent', { toUsername });
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', "Failed to send request");
    }
  });

  socket.on('accept-friend-request', async ({ fromUsername }) => {
    try {
      const success = await db.acceptFriendRequest(username, fromUsername);
      if (!success) return socket.emit('error-msg', 'Request not found');

      await db.addFriend(username, fromUsername);

      const meUser = await db.getUser(username);
      const fromUser = await db.getUser(fromUsername);

      // Tell me
      socket.emit('friend-added', { 
        username: fromUsername, 
        color: fromUser.color,
        online: onlineUsers.has(fromUsername)
      });
      socket.emit('request-removed', { fromUsername });

      // Tell them
      const fromSocketId = onlineUsers.get(fromUsername);
      if (fromSocketId) {
        io.to(fromSocketId).emit('friend-added', { 
          username: username, 
          color: meUser.color,
          online: true 
        });
      }
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Failed to accept request');
    }
  });

  socket.on('reject-friend-request', async ({ fromUsername }) => {
    try {
      await db.rejectFriendRequest(username, fromUsername);
      socket.emit('request-removed', { fromUsername });
    } catch (err) {
      console.error(err);
    }
  });

  // Handle Private Messaging
  socket.on('private-message', async (data) => {
    if (!data.text || !data.toUsername) return;
    
    try {
      const isFriend = await db.isFriend(username, data.toUsername);
      if (!isFriend) {
        return socket.emit('error-msg', 'You can only message friends');
      }

      const msg = await db.addMessage(username, data.toUsername, data.text);
      
      // send back to sender
      socket.emit('new-private-message', msg);
      
      // send to recipient if online
      const targetSocketId = onlineUsers.get(data.toUsername);
      if (targetSocketId) {
        io.to(targetSocketId).emit('new-private-message', msg);
      }
    } catch (err) {
      console.error(err);
      socket.emit('error-msg', 'Failed to send message');
    }
  });

  socket.on('load-dm-history', async ({ withUsername }) => {
    try {
      const isFriend = await db.isFriend(username, withUsername);
      if (!isFriend) return;
      
      const messages = await db.getMessagesBetween(username, withUsername);
      socket.emit('dm-history', { withUsername, messages });
    } catch (err) {
      console.error(err);
    }
  });

  // Typing
  socket.on('private-typing', async ({ toUsername }) => {
    try {
      const isFriend = await db.isFriend(username, toUsername);
      if (!isFriend) return;
      
      const targetSocketId = onlineUsers.get(toUsername);
      if (targetSocketId) {
        io.to(targetSocketId).emit('private-user-typing', { username });
      }
    } catch(err){}
  });

  socket.on('private-stop-typing', async ({ toUsername }) => {
    try {
      const isFriend = await db.isFriend(username, toUsername);
      if (!isFriend) return;
      
      const targetSocketId = onlineUsers.get(toUsername);
      if (targetSocketId) {
        io.to(targetSocketId).emit('private-user-stop-typing', { username });
      }
    } catch(err){}
  });

  // Disconnect
  socket.on('disconnect', async () => {
    console.log(`[-] ${username} disconnected`);
    onlineUsers.delete(username);
    
    try {
      const friends = await db.getFriends(username);
      friends.forEach(f => {
        const friendSocketId = onlineUsers.get(f.username);
        if (friendSocketId) {
          io.to(friendSocketId).emit('friend-online', { username, online: false });
        }
      });
    } catch (err) {
      console.error(err);
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Chat server running on http://localhost:${PORT}`));
