import { CanvasManager } from './canvas.js';
import { WebSocketManager } from './websocket.js';

class App {
  constructor() {
    this.canvasManager = null;
    this.wsManager = null;
    this.roomId = this.getRoomId();
    this.userName = '';
    this.userColor = this.generateUserColor();
    this.currentTheme = localStorage.getItem('theme') || 'dark';
    this.cursors = new Map();
    
    this.init();
  }

  init() {
    this.setupWelcomeModal();
    this.setupTheme();
    this.setupEventListeners();
  }

  getRoomId() {
    const params = new URLSearchParams(window.location.search);
    let roomId = params.get('room');
    
    if (!roomId) {
      roomId = this.generateRoomId();

      const newUrl = `${window.location.pathname}?room=${roomId}`;
      window.history.replaceState({}, '', newUrl);
    }
    
    return roomId;
  }

  generateRoomId() {
    return Math.random().toString(36).substring(2, 10);
  }

  generateUserColor() {
    const colors = [
      '#3B82F6', '#8B5CF6', '#EC4899', '#10B981',
      '#F59E0B', '#EF4444', '#06B6D4', '#F97316'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  setupWelcomeModal() {
    const welcomeModal = document.getElementById('welcomeModal');
    const userNameInput = document.getElementById('userNameInput');
    const joinButton = document.getElementById('joinButton');
    const roomIdDisplay = document.getElementById('roomIdDisplay');
    
    roomIdDisplay.textContent = this.roomId;
    
    userNameInput.focus();
    
    userNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        joinButton.click();
      }
    });
    
    joinButton.addEventListener('click', () => {
      const name = userNameInput.value.trim() || `User-${Math.random().toString(36).substring(2, 6)}`;
      this.userName = name;
      this.joinRoom();
    });
  }

  joinRoom() {
    document.getElementById('welcomeModal').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    this.wsManager = new WebSocketManager(this.roomId, this.userName, this.userColor);
    
    const canvas = document.getElementById('drawingCanvas');
    this.canvasManager = new CanvasManager(canvas, null, this.roomId, null);
    
    this.wsManager.on('onConnect', () => {
      this.canvasManager.socket = this.wsManager.socket;
      this.canvasManager.userId = this.wsManager.socket.id;
    });
    
    this.wsManager.connect();
    
    this.setupWebSocketCallbacks();
    this.setupCanvasCallbacks();
    this.setupToolControls();
  }

  setupWebSocketCallbacks() {
    this.wsManager.on('onRoomState', (data) => {
      if (data.actions && Array.isArray(data.actions)) {
        this.canvasManager.loadRoomState(data.actions);
      }
    });

    this.wsManager.on('onUserJoined', (data) => {
      this.updateUsersList(data.users);
    });

    this.wsManager.on('onUserLeft', (data) => {
      this.updateUsersList(data.users);
      this.removeCursor(data.userId);
    });

    this.wsManager.on('onDrawPath', (data) => {
      this.canvasManager.handleRemoteDrawPath(data);
    });

    this.wsManager.on('onDrawShape', (data) => {
      this.canvasManager.handleRemoteDrawShape(data);
    });

    this.wsManager.on('onDrawText', (data) => {
      this.canvasManager.handleRemoteDrawText(data);
    });

    this.wsManager.on('onErase', (data) => {
      this.canvasManager.handleRemoteErase(data);
    });

    this.wsManager.on('onClearCanvas', () => {
      this.canvasManager.handleRemoteClear();
    });

    this.wsManager.on('onUndo', (data) => {
      this.canvasManager.handleRemoteUndo(data.actionId);
    });

    this.wsManager.on('onCursorMove', (data) => {
      this.updateCursor(data);
    });
  }

  setupCanvasCallbacks() {
  }

  setupToolControls() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.dataset.tool;
        this.canvasManager.setTool(tool);
      });
    });

    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const color = swatch.dataset.color;
        this.canvasManager.setColor(color);
        document.getElementById('colorPicker').value = color;
      });
    });

    document.getElementById('colorPicker').addEventListener('input', (e) => {
      const color = e.target.value;
      this.canvasManager.setColor(color);

      document.querySelectorAll('.color-swatch').forEach(swatch => {
        if (swatch.dataset.color.toLowerCase() === color.toLowerCase()) {
          swatch.classList.add('active');
        } else {
          swatch.classList.remove('active');
        }
      });
    });

    const strokeWidthSlider = document.getElementById('strokeWidth');
    const strokeWidthValue = document.getElementById('strokeWidthValue');
    strokeWidthSlider.addEventListener('input', (e) => {
      const value = e.target.value;
      strokeWidthValue.textContent = `${value}px`;
      this.canvasManager.setStrokeWidth(parseInt(value));
    });

    const opacitySlider = document.getElementById('opacity');
    const opacityValue = document.getElementById('opacityValue');
    opacitySlider.addEventListener('input', (e) => {
      const value = e.target.value;
      opacityValue.textContent = `${value}%`;
      this.canvasManager.setOpacity(parseInt(value));
    });

    document.getElementById('undoBtn').addEventListener('click', () => {
      this.canvasManager.undo();
    });

    document.getElementById('redoBtn').addEventListener('click', () => {
      this.canvasManager.redo();
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
      this.canvasManager.clearCanvas();
    });

    document.getElementById('zoomIn').addEventListener('click', () => {
      this.canvasManager.zoomIn();
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
      this.canvasManager.zoomOut();
    });

    document.getElementById('zoomReset').addEventListener('click', () => {
      this.canvasManager.resetZoom();
    });
  }

  setupEventListeners() {
    document.getElementById('menuToggle').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.toggle('hidden');
    });

    document.getElementById('themeToggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    document.getElementById('shareButton').addEventListener('click', () => {
      this.shareRoom();
    });

    document.getElementById('exportButton').addEventListener('click', (e) => {
      this.exportCanvas(e);
    });

    document.getElementById('exportCanvasBtn').addEventListener('click', (e) => {
      this.exportCanvas(e);
    });

    document.getElementById('chatToggle').addEventListener('click', () => {
      const chatPanel = document.getElementById('chatPanel');
      chatPanel.classList.toggle('hidden');
    });


    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');
    
    chatSend.addEventListener('click', () => {
      this.sendChatMessage();
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChatMessage();
      }
    });

    this.setupColorPicker();
  }

  setupColorPicker() {
    const gradientPicker = document.getElementById('colorGradientPicker');
    const hueSlider = document.getElementById('colorHueSlider');
    let currentHue = 0;
    let pickerMarker = null;

    pickerMarker = document.createElement('div');
    pickerMarker.style.cssText = `
      position: absolute;
      width: 12px;
      height: 12px;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.3);
      pointer-events: none;
      transform: translate(-50%, -50%);
      z-index: 10;
    `;
    gradientPicker.appendChild(pickerMarker);

    const updateGradient = (hue) => {
      const baseColor = `hsl(${hue}, 100%, 50%)`;
      gradientPicker.style.background = `linear-gradient(to bottom, 
        ${baseColor} 0%, 
        hsl(${hue}, 100%, 25%) 50%, 
        hsl(${hue}, 0%, 50%) 100%)`;
    };

    hueSlider.addEventListener('input', (e) => {
      currentHue = parseInt(e.target.value);
      updateGradient(currentHue);
    });

    const updateColor = (x, y) => {
      const rect = gradientPicker.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      
      const saturation = Math.max(0, Math.min(100, Math.round((x / width) * 100)));
      const lightness = Math.max(0, Math.min(100, Math.round(100 - (y / height) * 100)));
      
      const color = `hsl(${currentHue}, ${saturation}%, ${lightness}%)`;
      this.canvasManager.setColor(color);
      document.getElementById('colorPicker').value = this.hslToHex(currentHue, saturation, lightness);
      
      pickerMarker.style.left = `${(x / width) * 100}%`;
      pickerMarker.style.top = `${(y / height) * 100}%`;
    };

    gradientPicker.addEventListener('click', (e) => {
      const rect = gradientPicker.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      updateColor(x, y);
    });

    gradientPicker.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) {
        const rect = gradientPicker.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        updateColor(x, y);
      }
    });

    updateGradient(0);
    updateColor(gradientPicker.offsetWidth / 2, gradientPicker.offsetHeight / 2);
  }

  hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (message) {
      const chatMessages = document.getElementById('chatMessages');
      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-message';
      messageDiv.innerHTML = `
        <div class="chat-message-user">You</div>
        <div class="chat-message-text">${message}</div>
      `;
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      chatInput.value = '';
    }
  }

  exportCanvas(e) {
    if (!this.canvasManager) return;
    
    const canvas = this.canvasManager.canvas;
    const link = document.createElement('a');
    link.download = `canvas-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    
    if (e && e.target) {
      const btn = e.target.closest('.icon-btn, .action-btn');
      if (btn) {
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => {
          btn.style.transform = '';
        }, 200);
      }
    }
    
    link.click();
    
    this.showNotification('Canvas exported successfully!', 'success');
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  setupTheme() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    this.updateThemeIcon();
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', this.currentTheme);
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    this.updateThemeIcon();
  }

  updateThemeIcon() {
    const themeIcon = document.getElementById('themeIcon');
    if (this.currentTheme === 'dark') {
      themeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>';
    } else {
      themeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>';
    }
  }

  shareRoom() {
    const url = window.location.href;
    
    if (navigator.share) {
      navigator.share({
        title: 'Collaborative Canvas',
        text: 'Join me on the collaborative canvas!',
        url: url
      }).catch(err => console.log('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(url).then(() => {
        alert('Room link copied to clipboard!');
      }).catch(err => {
        prompt('Copy this link to share:', url);
      });
    }
  }

  updateUsersList(users) {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '';
    
    users.forEach(user => {
      const avatar = document.createElement('div');
      avatar.className = 'user-avatar';
      avatar.style.background = user.userColor || this.userColor;
      avatar.textContent = (user.userName || 'User').substring(0, 2).toUpperCase();
      avatar.title = user.userName || 'User';
      usersList.appendChild(avatar);
    });
  }

  updateCursor(data) {
    const { userId, x, y, userName, userColor } = data;
    
    let cursor = this.cursors.get(userId);
    
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.className = 'user-cursor';
      cursor.setAttribute('data-name', userName || 'User');
      cursor.style.borderColor = userColor || this.userColor;
      cursor.style.color = userColor || this.userColor;
      document.getElementById('cursorsLayer').appendChild(cursor);
      this.cursors.set(userId, cursor);
    }
    
    const canvasRect = this.canvasManager.canvas.getBoundingClientRect();
    const canvasX = x * this.canvasManager.zoom + this.canvasManager.panX + canvasRect.left;
    const canvasY = y * this.canvasManager.zoom + this.canvasManager.panY + canvasRect.top;
    
    cursor.style.left = `${canvasX}px`;
    cursor.style.top = `${canvasY}px`;
    cursor.style.opacity = '1';
    
    clearTimeout(cursor.fadeTimeout);
    cursor.fadeTimeout = setTimeout(() => {
      cursor.style.opacity = '0';
    }, 1000);
  }

  removeCursor(userId) {
    const cursor = this.cursors.get(userId);
    if (cursor) {
      cursor.style.transition = 'opacity 0.3s ease';
      cursor.style.opacity = '0';
      setTimeout(() => {
        cursor.remove();
        this.cursors.delete(userId);
      }, 300);
    }
  }
}


document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

