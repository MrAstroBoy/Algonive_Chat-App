# NexChat — Real-Time Messaging App

NexChat is a modern, real-time private messaging application built for smooth and instantly responsive communication. It features an Instagram-style friend request system, persistent real-time direct messaging, live typing indicators, and online presence tracking.

## 🚀 Features

- **Real-Time Communication**: Instant messaging powered by `Socket.IO`.
- **Friend Request System**: Search for unique usernames and send, accept, or decline friend requests.
- **Private Direct Messaging**: Chat exclusively with accepted friends.
- **Live Statuses**: Real-time typing indicators (`...`) and Online/Offline presence tracking.
- **Persistent Storage**: All users, friends, requests, and messages are stored securely in a **PostgreSQL** database.
- **Secure Authentication**: Stateless authentication using `JSON Web Tokens (JWT)` and `bcrypt` for secure password hashing.
- **Premium UI/UX**: A dark-themed, glassmorphism-inspired responsive interface built purely with standard HTML/CSS.

---

## 🛠️ Tech Stack

**Backend:** Node.js, Express.js, Socket.IO, PostgreSQL (`pg`)  
**Frontend:** HTML5, Vanilla CSS, Vanilla JavaScript  
**Security:** JWT, bcryptjs, dotenv  

---

## ⚙️ Step-by-Step Installation & Setup

Follow these instructions to run the project on your local machine.

### 1. Prerequisites
You must have the following installed on your computer:
- [Node.js](https://nodejs.org/) (v16 or higher)
- [PostgreSQL](https://www.postgresql.org/) (Ensure the PostgreSQL server is running)

### 2. Clone the Repository
Open your terminal and navigate to the project folder where you extracted the code:
```bash
cd "path/to/chat-app"
```

### 3. Install Dependencies
Install all the required Node.js packages:
```bash
npm install
```

### 4. Setup PostgreSQL Database
1. Open your PostgreSQL terminal/pgAdmin and create a new database. For example:
   ```sql
   CREATE DATABASE "ChatDB";
   ```
2. Keep track of your PostgreSQL username and password (usually `postgres` / `root` on local machines).

### 5. Configure Environment Variables
In the root directory of the project, create or edit the `.env` file and add the following configuration:
```env
PORT=3000
JWT_SECRET=super_secret_jwt_key_12345
DATABASE_URL="postgresql://your_postgres_username:your_password@localhost:5432/ChatDB"
```
*(Replace `your_postgres_username` and `your_password` with your actual Postgres credentials).*

### 6. Initialize the Database Schema
Instead of writing SQL manually, run the included setup script to automatically create the necessary tables (`users`, `friends`, `friend_requests`, `messages`):
```bash
node server/setupDb.js
```
*You should see a success message indicating all tables are ready.*

### 7. Start the Application
Run the Node.js server:
```bash
npm start
```
*The server will start running, usually at http://localhost:3000.*

### 8. Use the App
1. Open [http://localhost:3000](http://localhost:3000) in your web browser.
2. **Create Account**: Register a new user.
3. Open a second browser window (or incognito mode) and register a second user.
4. **Find People**: Search for the first username and send a friend request.
5. **Chat**: Accept the request on the first window, click on the name in your sidebar, and start chatting instantly!

---

## 📁 Project Structure

```text
chat-app/
├── server/
│   ├── server.js        # Main Express & Socket.IO server setup
│   ├── auth.js          # JWT Generation & Verification logic
│   ├── db.js            # PostgreSQL Connection Pool and Queries
│   └── setupDb.js       # Script to auto-create PostgreSQL tables
├── public/
│   ├── index.html       # Authentication & Registration UI
│   ├── chat.html        # Main App Interface (Sidebar, DMs, Modals)
│   ├── css/
│   │   └── style.css    # Full application styling
│   └── js/
│       ├── auth.js      # Frontend Login/Register API calls
│       └── chat.js      # Frontend Socket.IO and DOM interaction
├── package.json
└── .env                 # Environment variables (Ignored in Git)
```
