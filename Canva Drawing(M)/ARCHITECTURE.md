# Architecture Documentation

## 📐 System Overview

The Collaborative Canvas application is a real-time, multi-user drawing application built with a client-server architecture using WebSockets for bidirectional communication.

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Client    │ ◄────────────────────────► │   Server    │
│  (Browser)  │      (Socket.io)            │  (Node.js)  │
└─────────────┘                             └─────────────┘
      │                                            │
      │                                            │
  Canvas API                                  State Management
  Drawing Logic                                Room Management
```

## 🔄 Data Flow

### Drawing Event Flow

```
User Action → Canvas Manager → WebSocket Manager → Server
                                                         │
                                                         ├─→ Broadcast to other clients
                                                         │
                                                         └─→ State Management
                                                              (History, Undo/Redo)
```

### Detailed Flow

1. **User draws on canvas**
   - `canvas.js` captures mouse/touch events
   - Creates path data structure
   - Draws locally for immediate feedback

2. **Event emission**
   - `canvas.js` calls `socket.emit('draw-path', data)`
   - Data includes: path coordinates, tool, color, stroke width, opacity

3. **Server processing**
   - `server.js` receives event via Socket.io
   - `drawing-state.js` stores action in room state
   - Server broadcasts to all other clients in the room

4. **Remote client receives**
   - `websocket.js` receives `draw-path` event
   - Calls registered callback
   - `canvas.js` renders the path on remote canvas

## 📡 WebSocket Protocol

### Message Types

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join-room` | `{ roomId, userName, userColor }` | User joins a room |
| `draw-start` | `{ roomId, x, y, tool, color, strokeWidth, opacity }` | Start drawing |
| `draw-move` | `{ roomId, x, y }` | Drawing in progress |
| `draw-end` | `{ roomId }` | Finished drawing |
| `draw-path` | `{ roomId, path, tool, color, strokeWidth, opacity }` | Complete path |
| `draw-shape` | `{ roomId, shape, tool, color, strokeWidth, opacity, fill }` | Shape drawn |
| `draw-text` | `{ roomId, text, x, y, color, fontSize, fontFamily }` | Text added |
| `erase` | `{ roomId, x, y, radius }` | Erase action |
| `clear-canvas` | `{ roomId }` | Clear entire canvas |
| `undo` | `{ roomId }` | Undo last action |
| `redo` | `{ roomId }` | Redo last undone action |
| `cursor-move` | `{ roomId, x, y }` | Cursor position update |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room-state` | `{ actions, timestamp }` | Initial room state on join |
| `user-joined` | `{ userId, userName, userColor, users }` | New user joined |
| `user-left` | `{ userId, users }` | User disconnected |
| `draw-start` | `{ userId, x, y, tool, ... }` | Remote user started drawing |
| `draw-move` | `{ userId, x, y }` | Remote user drawing |
| `draw-end` | `{ userId }` | Remote user finished |
| `draw-path` | `{ userId, path, tool, ... }` | Remote path complete |
| `draw-shape` | `{ userId, shape, tool, ... }` | Remote shape drawn |
| `draw-text` | `{ userId, text, x, y, ... }` | Remote text added |
| `erase` | `{ userId, x, y, radius }` | Remote erase |
| `clear-canvas` | `{ userId }` | Canvas cleared |
| `undo` | `{ userId, actionId }` | Action undone |
| `redo` | `{ userId, actionId }` | Action redone |
| `cursor-move` | `{ userId, x, y, userName, userColor }` | Remote cursor position |

## 🏗️ Component Architecture

### Client-Side (`client/`)

#### `main.js` - Application Controller
- **Responsibility**: App initialization, UI event handling, coordination
- **Key Functions**:
  - Room ID generation/parsing
  - Welcome modal handling
  - Theme management
  - User list updates
  - Cursor tracking UI

#### `canvas.js` - Canvas Manager
- **Responsibility**: All canvas drawing operations
- **Key Features**:
  - Drawing tool implementations (brush, shapes, text, eraser)
  - Path optimization for smooth drawing
  - Zoom and pan functionality
  - Local drawing history
  - Event handling (mouse, touch, keyboard)

**Drawing Algorithm**:
```javascript
// Path-based drawing for smooth curves
1. Capture mousedown → start path array
2. On mousemove → add points to path, draw segment
3. On mouseup → send complete path to server
4. Server broadcasts → remote clients render path
```

**Zoom & Pan**:
- Transform context: `ctx.translate(panX, panY)` and `ctx.scale(zoom, zoom)`
- Coordinates adjusted: `(x - panX) / zoom`

#### `websocket.js` - WebSocket Manager
- **Responsibility**: Socket.io connection and event management
- **Pattern**: Observer pattern with callback registration
- **Features**:
  - Automatic reconnection
  - Event subscription/unsubscription
  - Connection state management

### Server-Side (`server/`)

#### `server.js` - Express + Socket.io Server
- **Responsibility**: HTTP server, WebSocket server, routing
- **Key Features**:
  - Static file serving
  - Socket.io connection handling
  - Event routing to managers
  - CORS configuration

#### `rooms.js` - Room Manager
- **Responsibility**: User and room management
- **Data Structures**:
  - `rooms`: Map<roomId, Set<socketId>>
  - `users`: Map<socketId, { roomId, userName, userColor }>
- **Functions**:
  - `addUser(roomId, socketId, userName, userColor)`
  - `removeUser(roomId, socketId)`
  - `getRoomUsers(roomId)`
  - `generateColor()` - Assigns unique colors to users

#### `drawing-state.js` - Drawing State Manager
- **Responsibility**: Canvas state persistence and undo/redo
- **Data Structures**:
  - `roomStates`: Map<roomId, Array<action>>
  - `undoStacks`: Map<roomId, Map<userId, Array<action>>>
  - `redoStacks`: Map<roomId, Map<userId, Array<action>>>

**State Management**:
```javascript
// Each action has:
{
  type: 'draw-path' | 'draw-shape' | 'draw-text' | 'erase',
  userId: socketId,
  id: uniqueId,
  timestamp: Date.now(),
  ...tool-specific data
}
```

## 🔄 Undo/Redo Strategy

### Challenge
Global undo/redo across multiple users requires careful conflict resolution.

### Implementation

1. **Action Storage**
   - All drawing actions stored in chronological order
   - Each action has unique ID and userId

2. **Undo Process**
   ```
   User A requests undo:
   1. Find last action by User A (or any action if no user filter)
   2. Remove from room state
   3. Add to User A's undo stack
   4. Broadcast undo event to all clients
   5. All clients redraw canvas without that action
   ```

3. **Redo Process**
   ```
   User A requests redo:
   1. Pop action from User A's undo stack
   2. Add back to room state
   3. Broadcast redo event
   4. All clients render the action
   ```

4. **Conflict Resolution**
   - Undo only affects actions by the requesting user (or any if no user filter)
   - Redo maintains per-user stacks
   - New actions clear redo stack to prevent conflicts

### Limitations
- Undo/redo is linear (no branching)
- Concurrent undos by different users may cause temporary inconsistencies
- Large history may impact memory (limited to 100 actions per room)

## ⚡ Performance Optimizations

### Client-Side

1. **Path Batching**
   - Collect multiple mousemove events into single path
   - Send complete path instead of individual points
   - Reduces WebSocket message count

2. **Local Rendering**
   - Draw immediately on local canvas for instant feedback
   - Don't wait for server confirmation
   - Optimistic updates

3. **Canvas Redraw Strategy**
   - Only redraw when necessary (zoom, pan, undo)
   - Store actions, not full canvas state
   - Replay actions for redraw

4. **Event Throttling**
   - Cursor position updates throttled (not implemented, but recommended)
   - Drawing events batched

### Server-Side

1. **Room Isolation**
   - Each room maintains separate state
   - No cross-room data leakage
   - Efficient room lookup (Map structure)

2. **Memory Management**
   - Limit history size (100 actions)
   - Clean up empty rooms
   - No persistent storage (keeps memory low)

3. **Broadcast Optimization**
   - Only broadcast to users in same room
   - Exclude sender from broadcast (handled by client check)

## 🔒 Conflict Resolution

### Simultaneous Drawing
- **No locking mechanism**: Multiple users can draw simultaneously
- **Last-write-wins**: All actions are applied in order received
- **Visual merging**: Canvas compositing handles overlapping strokes

### Undo Conflicts
- User A undoes their action → removed from state
- User B's action remains → no conflict
- If User A undoes User B's action → User B's action removed (if no user filter)

### Network Latency
- **Client-side prediction**: Local drawing happens immediately
- **Server reconciliation**: Server state is source of truth
- **Event ordering**: Timestamps ensure chronological order

## 🚀 Scaling Considerations

### Current Limitations
- In-memory state (lost on server restart)
- No horizontal scaling (single server instance)
- No database persistence

### Scaling Strategies

1. **Horizontal Scaling**
   - Use Redis adapter for Socket.io
   - Share room state across server instances
   - Load balancer with sticky sessions

2. **Persistence**
   - Store actions in database (MongoDB, PostgreSQL)
   - Periodic snapshots of canvas state
   - Restore state on server restart

3. **Performance**
   - Action compression (reduce payload size)
   - Delta updates (only send changes)
   - Canvas tiling (only sync visible regions)

4. **User Limits**
   - Rate limiting per user
   - Max users per room
   - Max actions per room

## 🧪 Testing Strategy

### Manual Testing
1. **Single User**: All tools work correctly
2. **Multiple Users**: Real-time sync works
3. **Network Issues**: Reconnection handles disconnects
4. **Browser Compatibility**: Chrome, Firefox, Safari

### Recommended Automated Tests
- Unit tests for canvas operations
- Integration tests for WebSocket events
- Load tests for multiple concurrent users
- Performance tests for large canvases

## 🔍 Debugging

### Client-Side
- Browser DevTools → Network → WS tab (WebSocket messages)
- Console logs in `websocket.js` and `canvas.js`
- Canvas state inspection via `canvasManager`

### Server-Side
- Console logs for connection/disconnection
- Room state inspection via `drawingStateManager.getRoomState(roomId)`
- Socket.io admin UI (optional)

## 📊 Data Structures

### Drawing Action
```javascript
{
  type: 'draw-path' | 'draw-shape' | 'draw-text' | 'erase',
  userId: string,
  id: string,
  timestamp: number,
  // Tool-specific:
  path?: Array<{x, y}>,
  shape?: {startX, startY, endX, endY},
  text?: string,
  tool?: string,
  color?: string,
  strokeWidth?: number,
  opacity?: number
}
```

### User Object
```javascript
{
  socketId: string,
  roomId: string,
  userName: string,
  userColor: string
}
```

### Room State
```javascript
{
  actions: Array<Action>,
  timestamp: number
}
```

## 🎯 Future Enhancements

1. **Persistence**: Save/load canvas sessions
2. **Export**: PNG, SVG, PDF export
3. **Layers**: Multi-layer support
4. **Shapes**: More shape tools (polygon, arrow, etc.)
5. **Images**: Upload and draw images
6. **Chat**: Text chat sidebar
7. **Permissions**: Room owner, read-only users
8. **Mobile**: Better touch support
9. **Offline**: Service worker for offline capability
10. **Analytics**: Usage tracking and metrics

