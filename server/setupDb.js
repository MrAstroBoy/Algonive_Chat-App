require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function setup() {
  try {
    console.log('Connecting to PostgreSQL...');
    
    // Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        color VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Users table ready.');

    // Friends Table (M2M)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friends (
        user_a VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
        user_b VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_a, user_b)
      );
    `);
    console.log('Friends table ready.');

    // Friend Requests Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        sender VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
        receiver VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (sender, receiver)
      );
    `);
    console.log('Friend Requests table ready.');

    // Messages Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
        receiver VARCHAR(50) REFERENCES users(username) ON DELETE CASCADE,
        text TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Messages table ready.');

    console.log('Database schema initialization completed successfully.');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    pool.end();
  }
}

setup();
