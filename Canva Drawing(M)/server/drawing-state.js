export class DrawingStateManager {
  constructor() {
    this.roomStates = new Map();
    this.undoStacks = new Map();
    this.redoStacks = new Map();
  }

  getRoomState(roomId) {
    if (!this.roomStates.has(roomId)) {
      this.roomStates.set(roomId, []);
    }
    return {
      actions: this.roomStates.get(roomId),
      timestamp: Date.now()
    };
  }

  addDrawingAction(roomId, action) {
    if (!this.roomStates.has(roomId)) {
      this.roomStates.set(roomId, []);
    }
    
    const actionWithId = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    this.roomStates.get(roomId).push(actionWithId);
    
    if (!this.redoStacks.has(roomId)) {
      this.redoStacks.set(roomId, new Map());
    }
    this.redoStacks.get(roomId).clear();
    
    return actionWithId;
  }

  undo(roomId, userId) {
    if (!this.roomStates.has(roomId)) {
      return null;
    }
    
    const actions = this.roomStates.get(roomId);
    if (actions.length === 0) {
      return null;
    }
    
    let lastAction = null;
    let lastIndex = -1;
    
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].userId === userId || !actions[i].userId) {
        lastAction = actions[i];
        lastIndex = i;
        break;
      }
    }
    
    if (!lastAction) {
      return null;
    }
    
    actions.splice(lastIndex, 1);
    
    if (!this.undoStacks.has(roomId)) {
      this.undoStacks.set(roomId, new Map());
    }
    const undoStack = this.undoStacks.get(roomId);
    if (!undoStack.has(userId)) {
      undoStack.set(userId, []);
    }
    undoStack.get(userId).push(lastAction);
    
    return lastAction;
  }

  redo(roomId, userId) {
    if (!this.undoStacks.has(roomId)) {
      return null;
    }
    
    const undoStack = this.undoStacks.get(roomId);
    if (!undoStack.has(userId) || undoStack.get(userId).length === 0) {
      return null;
    }
    
    const action = undoStack.get(userId).pop();
    
    if (!this.roomStates.has(roomId)) {
      this.roomStates.set(roomId, []);
    }
    
    this.roomStates.get(roomId).push(action);
    
    return action;
  }

  clearRoom(roomId) {
    this.roomStates.set(roomId, []);
    if (this.undoStacks.has(roomId)) {
      this.undoStacks.get(roomId).clear();
    }
    if (this.redoStacks.has(roomId)) {
      this.redoStacks.get(roomId).clear();
    }
  }

  removeAction(roomId, actionId) {
    if (!this.roomStates.has(roomId)) {
      return false;
    }
    
    const actions = this.roomStates.get(roomId);
    const index = actions.findIndex(a => a.id === actionId);
    
    if (index !== -1) {
      actions.splice(index, 1);
      return true;
    }
    
    return false;
  }
}

