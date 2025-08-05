// server.js (UPDATED FOR MYSQL)
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise'; // *** NEW: Import mysql2

// Replicate __dirname functionality
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// *** NEW: MySQL Connection Pool ***
const dbPool = mysql.createPool({
  host: 'localhost',
  user: 'root', // Default XAMPP user
  password: '',   // Default XAMPP password
  database: 'react_chat_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
console.log('MySQL Connection Pool created.');


// Store chat room data (for online users list)
const rooms = {};

io.on('connection', (socket) => {
  console.log('New user connected');

  socket.on('joinRoom', async ({ username, room }) => { // *** ADDED async ***
    try {
      socket.join(room);
      socket.username = username;
      socket.room = room;

      if (!rooms[room]) {
        rooms[room] = { users: [] };
      }
      rooms[room].users.push(username);

      // *** NEW: Fetch message history from DB ***
      const [historyRows] = await dbPool.query(
        'SELECT username, message_text as text, timestamp FROM messages WHERE room_name = ? ORDER BY timestamp ASC LIMIT 50',
        [room]
      );
      // Emit history only to the user who just joined
      socket.emit('loadHistory', historyRows);

      socket.emit('message', {
        user: 'System',
        text: `Welcome to the ${room} room, ${username}!`,
      });

      socket.to(room).emit('message', {
        user: 'System',
        text: `${username} has joined the chat`,
      });

      io.to(room).emit('roomData', {
        room: room,
        users: rooms[room].users
      });
    } catch (error) {
      console.error('Error in joinRoom:', error);
    }
  });

  socket.on('chatMessage', async (msg) => { // *** ADDED async ***
    const messageData = {
      user: socket.username,
      text: msg,
      timestamp: new Date()
    };
    
    // Broadcast message to all clients
    io.to(socket.room).emit('message', messageData);

    // *** NEW: Save message to database ***
    try {
      await dbPool.query(
        'INSERT INTO messages (room_name, username, message_text) VALUES (?, ?, ?)',
        [socket.room, socket.username, msg]
      );
    } catch (error) {
      console.error('DB Insert Error:', error);
    }
  });

  // "is typing" and "disconnect" handlers remain the same...
  socket.on('typing', ({ room, isTyping }) => {
    socket.broadcast.to(room).emit('userTyping', { username: socket.username, isTyping });
  });

  socket.on('disconnect', () => {
    if (socket.username && socket.room) {
      const room = socket.room;
      const username = socket.username;

      if (rooms[room]) {
        rooms[room].users = rooms[room].users.filter(user => user !== username);
      }

      io.to(room).emit('message', {
        user: 'System',
        text: `${username} has left the chat`,
      });
      console.log('User disconnected');
      
      io.to(room).emit('roomData', {
        room: room,
        users: rooms[room] ? rooms[room].users : []
      });
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});