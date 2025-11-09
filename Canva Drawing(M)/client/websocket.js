export class WebSocketManager {
  constructor(roomId, userName, userColor) {
    this.roomId = roomId;
    this.userName = userName;
    this.userColor = userColor;
    this.socket = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    this.callbacks = {
      onConnect: [],
      onDisconnect: [],
      onUserJoined: [],
      onUserLeft: [],
      onDrawStart: [],
      onDrawMove: [],
      onDrawEnd: [],
      onDrawPath: [],
      onDrawShape: [],
      onDrawText: [],
      onErase: [],
      onClearCanvas: [],
      onUndo: [],
      onRedo: [],
      onCursorMove: [],
      onRoomState: []
    };
  }

  connect() {
    const serverUrl = window.location.origin;

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
      this.reconnectAttempts = 0;
      
      this.socket.emit('join-room', {
        roomId: this.roomId,
        userName: this.userName,
        userColor: this.userColor
      });
      
      this.triggerCallbacks('onConnect', []);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.connected = false;
      this.triggerCallbacks('onDisconnect', [reason]);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        alert('Failed to connect to server. Please refresh the page.');
      }
    });

    this.socket.on('user-joined', (data) => {
      console.log('User joined:', data);
      this.triggerCallbacks('onUserJoined', [data]);
    });

    this.socket.on('user-left', (data) => {
      console.log('User left:', data);
      this.triggerCallbacks('onUserLeft', [data]);
    });

    this.socket.on('room-state', (data) => {
      console.log('Room state received:', data);
      this.triggerCallbacks('onRoomState', [data]);
    });

    this.socket.on('draw-start', (data) => {
      if (data.userId !== this.socket.id) {
        this.triggerCallbacks('onDrawStart', [data]);
      }
    });

    this.socket.on('draw-move', (data) => {
      if (data.userId !== this.socket.id) {
        this.triggerCallbacks('onDrawMove', [data]);
      }
    });

    this.socket.on('draw-end', (data) => {
      if (data.userId !== this.socket.id) {
        this.triggerCallbacks('onDrawEnd', [data]);
      }
    });

    this.socket.on('draw-path', (data) => {
      if (data.userId !== this.socket.id) {
        this.triggerCallbacks('onDrawPath', [data]);
      }
    });

    this.socket.on('draw-shape', (data) => {
      if (data.userId !== this.socket.id) {
        this.triggerCallbacks('onDrawShape', [data]);
      }
    });

    this.socket.on('draw-text', (data) => {
      if (data.userId !== this.socket.id) {
        this.triggerCallbacks('onDrawText', [data]);
      }
    });

    this.socket.on('erase', (data) => {
      if (data.userId !== this.socket.id) {
        this.triggerCallbacks('onErase', [data]);
      }
    });

    this.socket.on('clear-canvas', (data) => {
      this.triggerCallbacks('onClearCanvas', [data]);
    });

    this.socket.on('undo', (data) => {
      this.triggerCallbacks('onUndo', [data]);
    });

    this.socket.on('redo', (data) => {
      this.triggerCallbacks('onRedo', [data]);
    });

    this.socket.on('cursor-move', (data) => {
      if (data.userId !== this.socket.id) {
        this.triggerCallbacks('onCursorMove', [data]);
      }
    });
  }

  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
  }

  off(event, callback) {
    if (this.callbacks[event]) {
      const index = this.callbacks[event].indexOf(callback);
      if (index > -1) {
        this.callbacks[event].splice(index, 1);
      }
    }
  }

  triggerCallbacks(event, args) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in ${event} callback:`, error);
        }
      });
    }
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit:', event);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected && this.socket?.connected;
  }
}

