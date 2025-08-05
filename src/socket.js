// src/socket.js
import { io } from 'socket.io-client';

// Connect to the server using the environment variable.
// Vite automatically makes `import.meta.env.VITE_SERVER_URL` available.
export const socket = io(import.meta.env.VITE_SERVER_URL);