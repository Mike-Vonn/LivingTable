import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { createApp } from './app.js';
import { socketAuth } from './auth/middleware.js';
import { registerSocketHandlers } from './socket/index.js';
import { PORT, CORS_ORIGINS } from './config.js';

const app = createApp();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

// Socket.io auth middleware
io.use(socketAuth);

// Register all socket event handlers
registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`LivingTable server running on http://localhost:${PORT}`);
});
