// src/socket.js
import { io } from 'socket.io-client';

// Connect to the server.
// The URL should point to your server.
export const socket = io('http://192.168.0.122:3000');