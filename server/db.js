require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  
  // Data Access Methods replacing in-memory store
  
  // Users
  addUser: async (username, passwordHash, color) => {
    return pool.query(
      'INSERT INTO users (username, password_hash, color) VALUES ($1, $2, $3) RETURNING *',
      [username, passwordHash, color]
    );
  },
  
  getUser: async (username) => {
    const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return res.rows[0];
  },
  
  searchUsers: async (query, excludeUsername) => {
    const res = await pool.query(
      `SELECT username, color FROM users 
       WHERE username ILIKE $1 AND username != $2 
       LIMIT 20`,
      [`%${query}%`, excludeUsername]
    );
    return res.rows;
  },

  // Friends
  addFriend: async (userA, userB) => {
    const res = await pool.query(
      `INSERT INTO friends (user_a, user_b) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING RETURNING *`,
      [userA, userB]
    );
    return res.rowCount > 0;
  },
  
  getFriends: async (username) => {
    const res = await pool.query(
      `SELECT u.username, u.color 
       FROM friends f 
       JOIN users u ON f.user_b = u.username 
       WHERE f.user_a = $1`,
      [username]
    );
    return res.rows;
  },
  
  isFriend: async (userA, userB) => {
    const res = await pool.query(
      `SELECT 1 FROM friends WHERE user_a = $1 AND user_b = $2`,
      [userA, userB]
    );
    return res.rowCount > 0;
  },

  // Friend Requests
  addFriendRequest: async (sender, receiver) => {
    const res = await pool.query(
      `INSERT INTO friend_requests (sender, receiver, status) 
       VALUES ($1, $2, 'pending') 
       ON CONFLICT (sender, receiver) DO NOTHING 
       RETURNING *`,
      [sender, receiver]
    );
    return res.rowCount > 0;
  },
  
  getPendingRequestsForUser: async (username) => {
    const res = await pool.query(
      `SELECT r.sender as username, u.color 
       FROM friend_requests r 
       JOIN users u ON r.sender = u.username 
       WHERE r.receiver = $1 AND r.status = 'pending'`,
      [username]
    );
    return res.rows;
  },
  
  getSentRequestsByUser: async (username) => {
    const res = await pool.query(
      `SELECT receiver as username FROM friend_requests 
       WHERE sender = $1 AND status = 'pending'`,
      [username]
    );
    return res.rows;
  },
  
  acceptFriendRequest: async (receiver, sender) => {
    // Delete the request and return true if a request actually existed
    const res = await pool.query(
      `DELETE FROM friend_requests WHERE 
       (sender = $1 AND receiver = $2 AND status = 'pending')
       RETURNING *`,
      [sender, receiver]
    );
    return res.rowCount > 0;
  },
  
  rejectFriendRequest: async (receiver, sender) => {
    const res = await pool.query(
      `DELETE FROM friend_requests WHERE sender = $1 AND receiver = $2 AND status = 'pending'`,
      [sender, receiver]
    );
    return res.rowCount > 0;
  },

  // Messages
  addMessage: async (from, to, text, timestamp) => {
    const d = timestamp ? new Date(timestamp) : new Date();
    const res = await pool.query(
      `INSERT INTO messages (sender, receiver, text, timestamp) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [from, to, text, d]
    );
    const row = res.rows[0];
    return {
      from: row.sender,
      to: row.receiver,
      text: row.text,
      timestamp: row.timestamp.toISOString()
    };
  },
  
  getMessagesBetween: async (userA, userB) => {
    const res = await pool.query(
      `SELECT sender as from, receiver as to, text, timestamp 
       FROM messages 
       WHERE (sender = $1 AND receiver = $2) OR (sender = $2 AND receiver = $1)
       ORDER BY timestamp ASC`,
      [userA, userB]
    );
    return res.rows.map(r => ({
      from: r.from,
      to: r.to,
      text: r.text,
      timestamp: r.timestamp.toISOString()
    }));
  }
};
