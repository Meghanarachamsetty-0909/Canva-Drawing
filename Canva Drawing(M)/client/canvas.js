export class CanvasManager {
  constructor(canvasElement, socket, roomId, userId) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.socket = socket;
    this.roomId = roomId;
    this.userId = userId;
    
    this.isDrawing = false;
    this.currentTool = 'brush';
    this.currentColor = '#000000';
    this.strokeWidth = 5;
    this.opacity = 1;
    this.fill = false;
    
    this.currentPath = [];
    this.lastPoint = null;
    
    this.shapeStart = null;
    this.isDrawingShape = false;
    this.tempShape = null;
    
    this.textInput = null;
    this.textStartPos = null;
    
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPoint = null;
    
    this.drawingHistory = [];
    this.historyIndex = -1;
    this.maxHistorySize = 100;
    
    this.serverActions = [];
    
    this.eraserRadius = 20;
    
    this.setupCanvas();
    this.setupEventListeners();
  }

  setupCanvas() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalCompositeOperation = 'source-over';
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    this.redrawCanvas();
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
    
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
  }

  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    
    return {
      x: (x - this.panX) / this.zoom,
      y: (y - this.panY) / this.zoom
    };
  }

  handleMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      return;
    }
    
    if (e.button !== 0) return;
    
    const coords = this.getCanvasCoordinates(e);
    this.startDrawing(coords.x, coords.y);
  }

  handleMouseMove(e) {
    if (this.isPanning && this.lastPanPoint) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.panX += dx;
      this.panY += dy;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.redrawCanvas();
      return;
    }
    
    const coords = this.getCanvasCoordinates(e);
    
    if (this.isDrawing) {
      this.continueDrawing(coords.x, coords.y);
    } else if (this.isDrawingShape && this.shapeStart) {
      this.updateShape(coords.x, coords.y);
    }
    
    if (this.socket) {
      this.socket.emit('cursor-move', {
        roomId: this.roomId,
        x: coords.x,
        y: coords.y
      });
    }
  }

  handleMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.lastPanPoint = null;
      return;
    }
    
    if (this.isDrawing) {
      const coords = this.getCanvasCoordinates(e);
      this.finishDrawing(coords.x, coords.y);
    } else if (this.isDrawingShape && this.shapeStart) {
      const coords = this.getCanvasCoordinates(e);
      this.finishShape(coords.x, coords.y);
    }
  }

  handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const coords = this.getCanvasCoordinates(e);
      this.startDrawing(coords.x, coords.y);
    } else if (e.touches.length === 2) {
      this.isPanning = true;
    }
  }

  handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && this.isDrawing) {
      const coords = this.getCanvasCoordinates(e);
      this.continueDrawing(coords.x, coords.y);
    }
  }

  handleTouchEnd(e) {
    e.preventDefault();
    if (this.isDrawing) {
      const coords = this.getCanvasCoordinates(e);
      this.finishDrawing(coords.x, coords.y);
    }
    this.isPanning = false;
  }

  handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newZoom = Math.max(0.1, Math.min(5, this.zoom * delta));
    const zoomChange = newZoom / this.zoom;
    
    this.panX = x - (x - this.panX) * zoomChange;
    this.panY = y - (y - this.panY) * zoomChange;
    this.zoom = newZoom;
    
    this.redrawCanvas();
    this.updateZoomDisplay();
  }

  handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redo();
    }
  }

  startDrawing(x, y) {
    if (this.currentTool === 'text') {
      this.startTextInput(x, y);
      return;
    }
    
    this.isDrawing = true;
    this.currentPath = [{ x, y }];
    this.lastPoint = { x, y };
    
    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      if (this.socket) {
        this.socket.emit('draw-start', {
          roomId: this.roomId,
          x, y,
          tool: this.currentTool,
          color: this.currentColor,
          strokeWidth: this.currentTool === 'eraser' ? this.eraserRadius : this.strokeWidth,
          opacity: this.opacity
        });
      }
    } else if (['line', 'rectangle', 'circle'].includes(this.currentTool)) {
      this.shapeStart = { x, y };
      this.isDrawingShape = true;
    }
  }

  continueDrawing(x, y) {
    if (!this.isDrawing) return;
    
    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      this.currentPath.push({ x, y });
      
      this.drawSegment(this.lastPoint, { x, y });
      this.lastPoint = { x, y };
      
    }
  }

  finishDrawing(x, y) {
    if (!this.isDrawing) return;
    
    if (this.currentTool === 'brush' || this.currentTool === 'eraser') {
      this.currentPath.push({ x, y });
      
      if (this.socket) {
        this.socket.emit('draw-path', {
          roomId: this.roomId,
          path: this.currentPath,
          tool: this.currentTool,
          color: this.currentColor,
          strokeWidth: this.currentTool === 'eraser' ? this.eraserRadius : this.strokeWidth,
          opacity: this.opacity
        });
      }
      
      this.serverActions.push({
        type: 'draw-path',
        path: this.currentPath,
        tool: this.currentTool,
        color: this.currentColor,
        strokeWidth: this.currentTool === 'eraser' ? this.eraserRadius : this.strokeWidth,
        opacity: this.opacity,
        userId: this.userId
      });
      
      this.saveToHistory();
    }
    
    this.isDrawing = false;
    this.currentPath = [];
    this.lastPoint = null;
    
    if (this.socket) {
      this.socket.emit('draw-end', { roomId: this.roomId });
    }
  }

  updateShape(x, y) {
    if (!this.shapeStart) return;
    
    this.redrawCanvas();
    
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    this.drawShape(this.shapeStart.x, this.shapeStart.y, x, y, true);
    this.ctx.restore();
  }

  finishShape(x, y) {
    if (!this.shapeStart) return;
    
    const shape = {
      startX: this.shapeStart.x,
      startY: this.shapeStart.y,
      endX: x,
      endY: y
    };
    
    if (this.socket) {
      this.socket.emit('draw-shape', {
        roomId: this.roomId,
        shape,
        tool: this.currentTool,
        color: this.currentColor,
        strokeWidth: this.strokeWidth,
        opacity: this.opacity,
        fill: this.fill
      });
    }
    
    this.serverActions.push({
      type: 'draw-shape',
      shape,
      tool: this.currentTool,
      color: this.currentColor,
      strokeWidth: this.strokeWidth,
      opacity: this.opacity,
      fill: this.fill,
      userId: this.userId
    });
    
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    this.drawShape(shape.startX, shape.startY, shape.endX, shape.endY, false);
    this.ctx.restore();
    
    this.saveToHistory();
    
    this.isDrawingShape = false;
    this.shapeStart = null;
  }

  drawSegment(from, to) {
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    
    if (this.currentTool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = this.currentColor;
      
      if (this.currentTool === 'brush') {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = this.currentColor;
        this.ctx.lineWidth = (this.currentTool === 'eraser' ? this.eraserRadius : this.strokeWidth) + 4;
        this.ctx.globalAlpha = this.opacity * 0.3;
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();
        
        this.ctx.shadowBlur = 0;
        this.ctx.shadowColor = 'transparent';
      }
    }
    
    this.ctx.lineWidth = this.currentTool === 'eraser' ? this.eraserRadius : this.strokeWidth;
    this.ctx.globalAlpha = this.opacity;
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
    
    this.ctx.restore();
  }

  drawShape(startX, startY, endX, endY, isTemp = false) {
    this.ctx.save();
    
    if (isTemp) {
      this.ctx.globalAlpha = 0.5;
    } else {
      this.ctx.globalAlpha = this.opacity;
    }
    
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.strokeWidth;
    
    if (this.fill) {
      this.ctx.fillStyle = this.currentColor;
    }
    
    this.ctx.beginPath();
    
    const width = endX - startX;
    const height = endY - startY;
    
    switch (this.currentTool) {
      case 'line':
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        break;
      case 'rectangle':
        this.ctx.rect(startX, startY, width, height);
        break;
      case 'circle':
        const centerX = (startX + endX) / 2;
        const centerY = (startY + endY) / 2;
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        break;
    }
    
    if (this.fill) {
      this.ctx.fill();
    }
    this.ctx.stroke();
    
    this.ctx.restore();
  }

  startTextInput(x, y) {
    if (this.textInput) {
      this.textInput.remove();
    }
    
    this.textStartPos = { x, y };
    this.textInput = document.createElement('input');
    this.textInput.type = 'text';
    this.textInput.className = 'text-input';
    this.textInput.style.left = `${x * this.zoom + this.panX}px`;
    this.textInput.style.top = `${y * this.zoom + this.panY}px`;
    this.textInput.style.fontSize = `${16 * this.zoom}px`;
    this.textInput.style.color = this.currentColor;
    this.textInput.style.borderColor = this.currentColor;
    
    document.body.appendChild(this.textInput);
    this.textInput.focus();
    
    const finishText = () => {
      const text = this.textInput.value.trim();
      if (text) {
        if (this.socket) {
          this.socket.emit('draw-text', {
            roomId: this.roomId,
            text,
            x: this.textStartPos.x,
            y: this.textStartPos.y,
            color: this.currentColor,
            fontSize: 16,
            fontFamily: 'Arial'
          });
        }
        
        this.serverActions.push({
          type: 'draw-text',
          text,
          x: this.textStartPos.x,
          y: this.textStartPos.y,
          color: this.currentColor,
          fontSize: 16,
          fontFamily: 'Arial',
          userId: this.userId
        });
        
        this.drawText(text, this.textStartPos.x, this.textStartPos.y);
        this.saveToHistory();
      }
      
      this.textInput.remove();
      this.textInput = null;
      this.textStartPos = null;
    };
    
    this.textInput.addEventListener('blur', finishText);
    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishText();
      } else if (e.key === 'Escape') {
        this.textInput.remove();
        this.textInput = null;
        this.textStartPos = null;
      }
    });
  }

  drawText(text, x, y, color = this.currentColor, fontSize = 16) {
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    this.ctx.fillStyle = color;
    this.ctx.font = `${fontSize}px Arial`;
    this.ctx.fillText(text, x, y);
    this.ctx.restore();
  }

  handleRemoteDrawStart(data) {
  }

  handleRemoteDrawMove(data) {
  }

  handleRemoteDrawPath(data) {
    const { path, tool, color, strokeWidth, opacity, userId } = data;
    
    if (userId && userId !== this.userId) {
      this.serverActions.push({ type: 'draw-path', ...data });
    }
    
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    
    if (tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = color;
    }
    
    this.ctx.lineWidth = strokeWidth;
    this.ctx.globalAlpha = opacity;
    this.ctx.beginPath();
    
    if (path.length > 0) {
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        this.ctx.lineTo(path[i].x, path[i].y);
      }
    }
    
    this.ctx.stroke();
    this.ctx.restore();
  }

  handleRemoteDrawShape(data) {
    const { shape, tool, color, strokeWidth, opacity, fill, userId } = data;
    
    if (userId && userId !== this.userId) {
      this.serverActions.push({ type: 'draw-shape', ...data });
    }
    
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = strokeWidth;
    this.ctx.globalAlpha = opacity;
    
    if (fill) {
      this.ctx.fillStyle = color;
    }
    
    this.ctx.beginPath();
    
    const { startX, startY, endX, endY } = shape;
    const width = endX - startX;
    const height = endY - startY;
    
    switch (tool) {
      case 'line':
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        break;
      case 'rectangle':
        this.ctx.rect(startX, startY, width, height);
        break;
      case 'circle':
        const centerX = (startX + endX) / 2;
        const centerY = (startY + endY) / 2;
        const radiusX = Math.abs(width) / 2;
        const radiusY = Math.abs(height) / 2;
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        break;
    }
    
    if (fill) {
      this.ctx.fill();
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  handleRemoteDrawText(data) {
    const { text, x, y, color, fontSize, userId } = data;
    
    if (userId && userId !== this.userId) {
      this.serverActions.push({ type: 'draw-text', ...data });
    }
    
    this.drawText(text, x, y, color, fontSize);
  }

  handleRemoteErase(data) {
    const { x, y, radius } = data;
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  handleRemoteClear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawingHistory = [];
    this.historyIndex = -1;
    this.serverActions = [];
  }

  undo() {
    if (this.socket) {
      this.socket.emit('undo', { roomId: this.roomId });
    }
  }

  redo() {
    if (this.socket) {
      this.socket.emit('redo', { roomId: this.roomId });
    }
  }

  handleRemoteUndo(actionId) {
    if (actionId) {
      this.serverActions = this.serverActions.filter(action => action.id !== actionId);
    }
    this.redrawCanvas();
  }

  clearCanvas() {
    if (confirm('Are you sure you want to clear the entire canvas?')) {
      if (this.socket) {
        this.socket.emit('clear-canvas', { roomId: this.roomId });
      }
      this.handleRemoteClear();
    }
  }

  saveToHistory() {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.drawingHistory = this.drawingHistory.slice(0, this.historyIndex + 1);
    this.drawingHistory.push(imageData);
    this.historyIndex++;
    
    if (this.drawingHistory.length > this.maxHistorySize) {
      this.drawingHistory.shift();
      this.historyIndex--;
    }
  }

  redrawCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.serverActions.forEach(action => {
      switch (action.type) {
        case 'draw-path':
          this.handleRemoteDrawPath(action);
          break;
        case 'draw-shape':
          this.handleRemoteDrawShape(action);
          break;
        case 'draw-text':
          this.handleRemoteDrawText(action);
          break;
      }
    });
  }

  setTool(tool) {
    this.currentTool = tool;
    if (tool === 'eraser') {
      this.canvas.style.cursor = 'grab';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  setColor(color) {
    this.currentColor = color;
  }

  setStrokeWidth(width) {
    this.strokeWidth = width;
  }

  setOpacity(opacity) {
    this.opacity = opacity / 100;
  }

  setFill(fill) {
    this.fill = fill;
  }

  zoomIn() {
    this.zoom = Math.min(5, this.zoom * 1.2);
    this.redrawCanvas();
    this.updateZoomDisplay();
  }

  zoomOut() {
    this.zoom = Math.max(0.1, this.zoom / 1.2);
    this.redrawCanvas();
    this.updateZoomDisplay();
  }

  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.redrawCanvas();
    this.updateZoomDisplay();
  }

  updateZoomDisplay() {
    const zoomDisplay = document.getElementById('zoomLevel');
    if (zoomDisplay) {
      zoomDisplay.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  loadRoomState(actions) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.serverActions = [];
    
    if (actions && Array.isArray(actions)) {
      actions.forEach(action => {
        this.serverActions.push(action);
        
        switch (action.type) {
          case 'draw-path':
            this.handleRemoteDrawPath(action);
            break;
          case 'draw-shape':
            this.handleRemoteDrawShape(action);
            break;
          case 'draw-text':
            this.handleRemoteDrawText(action);
            break;
        }
      });
    }
  }
}

