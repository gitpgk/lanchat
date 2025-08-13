// server.js (UPDATED TO DETECT MENTIONS)
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

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

const dbPool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'react_chat_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
console.log('MySQL Connection Pool created.');

const userSockets = {};
const rooms = {};

io.on('connection', (socket) => {
  console.log('New user connected');

  socket.on('joinRoom', async ({ username, room }) => {
    try {
      socket.join(room);
      socket.username = username;
      socket.room = room;
      userSockets[username] = socket.id;

      if (!rooms[room]) {
        rooms[room] = { users: [] };
      }
      rooms[room].users.push(username);

      const [historyRows] = await dbPool.query(
        'SELECT username, message_text as text, timestamp FROM messages WHERE room_name = ? ORDER BY timestamp ASC LIMIT 50',
        [room]
      );
      socket.emit('loadHistory', { room, messages: historyRows });

      socket.emit('message', { user: 'System', text: `Welcome to the ${room} room, ${username}!`, isPrivate: false });
      socket.to(room).emit('message', { user: 'System', text: `${username} has joined the chat`, isPrivate: false });
      io.to(room).emit('roomData', { room: room, users: rooms[room].users });
    } catch (error) {
      console.error('Error in joinRoom:', error);
    }
  });

  // --- UPDATE: This handler now detects mentions ---
  socket.on('chatMessage', async (msg) => {
    // Regular expression to find @mentions
    const mentionRegex = /@(\w+)/g;
    const mentions = [...msg.matchAll(mentionRegex)].map(match => match[1]);

    const messageData = {
      user: socket.username,
      text: msg,
      timestamp: new Date(),
      isPrivate: false,
      mentions: mentions // NEW: Add the list of mentioned users
    };
    
    io.to(socket.room).emit('message', messageData);

    try {
      await dbPool.query('INSERT INTO messages (room_name, username, message_text) VALUES (?, ?, ?)', [socket.room, socket.username, msg]);
    } catch (error) {
      console.error('DB Insert Error:', error);
    }
  });

  socket.on('privateMessage', ({ content, to }) => {
    const recipientSocketId = userSockets[to];
    const messageData = { from: socket.username, to: to, text: content, timestamp: new Date(), isPrivate: true };
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message', messageData);
      socket.emit('message', messageData);
    }
  });

  socket.on('clearHistory', async ({ room }) => {
    try {
      await dbPool.query('DELETE FROM messages WHERE room_name = ?', [room]);
      console.log(`History cleared for room: ${room}`);
      io.to(room).emit('historyCleared');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  });

  socket.on('typing', ({ room, isTyping, recipient }) => {
    if (recipient) {
      const recipientSocketId = userSockets[recipient];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('userTyping', { username: socket.username, isTyping });
      }
    } else {
      socket.broadcast.to(room).emit('userTyping', { username: socket.username, isTyping });
    }
  });

  socket.on('disconnect', () => {
    const username = socket.username;
    const room = socket.room;
    if (username && room) {
      if (rooms[room]) {
        rooms[room].users = rooms[room].users.filter(user => user !== username);
      }
      delete userSockets[username];
      io.to(room).emit('message', { user: 'System', text: `${username} has left the chat` });
      console.log('User disconnected');
      io.to(room).emit('roomData', { room: room, users: rooms[room] ? rooms[room].users : [] });
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});