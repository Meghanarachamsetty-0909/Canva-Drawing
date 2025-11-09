export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.users = new Map();
  }

  addUser(roomId, socketId, userName, userColor) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    
    this.rooms.get(roomId).add(socketId);
    this.users.set(socketId, {
      roomId,
      userName: userName || `User-${socketId.substring(0, 6)}`,
      userColor: userColor || this.generateColor()
    });
  }

  removeUser(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(socketId);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
    this.users.delete(socketId);
  }

  getUser(socketId) {
    return this.users.get(socketId);
  }

  getRoomUsers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    
    return Array.from(room).map(socketId => {
      const user = this.users.get(socketId);
      return {
        socketId,
        userName: user?.userName,
        userColor: user?.userColor
      };
    });
  }

  generateColor() {
    const colors = [
      '#3B82F6',
      '#8B5CF6',
      '#EC4899',
      '#10B981',
      '#F59E0B',
      '#EF4444',
      '#06B6D4',
      '#F97316'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  getRoomCount(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.size : 0;
  }
}

