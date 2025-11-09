import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RoomManager } from './rooms.js';
import { DrawingStateManager } from './drawing-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

app.use(express.static(join(__dirname, '../client')));

const roomManager = new RoomManager();
const drawingStateManager = new DrawingStateManager();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, userName, userColor }) => {
    socket.join(roomId);
    roomManager.addUser(roomId, socket.id, userName, userColor);
    
    const roomState = drawingStateManager.getRoomState(roomId);
    socket.emit('room-state', roomState);
    
    const users = roomManager.getRoomUsers(roomId);
    io.to(roomId).emit('user-joined', {
      userId: socket.id,
      userName,
      userColor,
      users: users
    });
    
    console.log(`${userName} joined room ${roomId}`);
  });

  socket.on('draw-start', (data) => {
    const { roomId, x, y, tool, color, strokeWidth, opacity } = data;
    drawingStateManager.addDrawingAction(roomId, {
      type: 'draw-start',
      userId: socket.id,
      x, y, tool, color, strokeWidth, opacity,
      timestamp: Date.now()
    });
    socket.to(roomId).emit('draw-start', { ...data, userId: socket.id });
  });

  socket.on('draw-move', (data) => {
    const { roomId, x, y } = data;
    socket.to(roomId).emit('draw-move', { ...data, userId: socket.id });
  });

  socket.on('draw-end', (data) => {
    const { roomId } = data;
    drawingStateManager.addDrawingAction(roomId, {
      type: 'draw-end',
      userId: socket.id,
      timestamp: Date.now()
    });
    socket.to(roomId).emit('draw-end', { ...data, userId: socket.id });
  });

  socket.on('draw-path', (data) => {
    const { roomId, path, tool, color, strokeWidth, opacity } = data;
    const action = {
      type: 'draw-path',
      userId: socket.id,
      path,
      tool,
      color,
      strokeWidth,
      opacity,
      timestamp: Date.now()
    };
    drawingStateManager.addDrawingAction(roomId, action);
    socket.to(roomId).emit('draw-path', { ...data, userId: socket.id });
  });

  socket.on('draw-shape', (data) => {
    const { roomId, shape, tool, color, strokeWidth, opacity, fill } = data;
    const action = {
      type: 'draw-shape',
      userId: socket.id,
      shape,
      tool,
      color,
      strokeWidth,
      opacity,
      fill,
      timestamp: Date.now()
    };
    drawingStateManager.addDrawingAction(roomId, action);
    socket.to(roomId).emit('draw-shape', { ...data, userId: socket.id });
  });

  socket.on('draw-text', (data) => {
    const { roomId, text, x, y, color, fontSize, fontFamily } = data;
    const action = {
      type: 'draw-text',
      userId: socket.id,
      text,
      x, y,
      color,
      fontSize,
      fontFamily,
      timestamp: Date.now()
    };
    drawingStateManager.addDrawingAction(roomId, action);
    socket.to(roomId).emit('draw-text', { ...data, userId: socket.id });
  });

  socket.on('erase', (data) => {
    const { roomId, x, y, radius } = data;
    const action = {
      type: 'erase',
      userId: socket.id,
      x, y, radius,
      timestamp: Date.now()
    };
    drawingStateManager.addDrawingAction(roomId, action);
    socket.to(roomId).emit('erase', { ...data, userId: socket.id });
  });

  socket.on('clear-canvas', (data) => {
    const { roomId } = data;
    drawingStateManager.clearRoom(roomId);
    io.to(roomId).emit('clear-canvas', { userId: socket.id });
  });

  socket.on('undo', (data) => {
    const { roomId } = data;
    const action = drawingStateManager.undo(roomId, socket.id);
    if (action) {
      io.to(roomId).emit('undo', { userId: socket.id, actionId: action.id });
    }
  });

  socket.on('redo', (data) => {
    const { roomId } = data;
    const action = drawingStateManager.redo(roomId, socket.id);
    if (action) {
      io.to(roomId).emit('redo', { userId: socket.id, actionId: action.id });
    }
  });

  socket.on('cursor-move', (data) => {
    const { roomId, x, y } = data;
    socket.to(roomId).emit('cursor-move', {
      userId: socket.id,
      x, y,
      userName: roomManager.getUser(socket.id)?.userName,
      userColor: roomManager.getUser(socket.id)?.userColor
    });
  });

  socket.on('disconnect', () => {
    const user = roomManager.getUser(socket.id);
    if (user) {
      roomManager.removeUser(user.roomId, socket.id);
      io.to(user.roomId).emit('user-left', {
        userId: socket.id,
        users: roomManager.getRoomUsers(user.roomId)
      });
      console.log(`User ${socket.id} left room ${user.roomId}`);
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

