# Tigerd Agent API Documentation

Base URL: `http://localhost:4096` (default, actual port may vary)

## Table of Contents
- [Sessions](#sessions)
- [Messages](#messages)
- [Events (SSE)](#events-sse)
- [Questions](#questions)
- [Permissions](#permissions)
- [Providers](#providers)
- [Configuration](#configuration)
- [Other Endpoints](#other-endpoints)

---

## Sessions

### Create Session
```
POST /session
```
Create a new OpenCode session.

**Request Body:**
```json
{
  "directory": "/path/to/workspace"  // optional, defaults to cwd
}
```

**Response:**
```json
{
  "id": "session_id",
  "title": "Session Title",
  "directory": "/path/to/workspace",
  "time": { "created": 1234567890, "updated": 1234567890 },
  ...
}
```

---

### List Sessions
```
GET /session
```
Get list of all sessions.

**Query Parameters:**
- `directory` - Filter by project directory
- `roots` - Only return root sessions (no parentID)
- `start` - Filter sessions updated on or after timestamp
- `search` - Filter sessions by title (case-insensitive)
- `limit` - Maximum number of sessions to return

---

### Get Session
```
GET /session/:sessionID
```
Get detailed information about a specific session.

---

### Delete Session
```
DELETE /session/:sessionID
```
Delete a session and all associated data.

---

### Update Session
```
PATCH /session/:sessionID
```
Update session properties.

**Request Body:**
```json
{
  "title": "New Title",
  "time": { "archived": 1234567890 }  // optional
}
```

---

### Abort Session
```
POST /session/:sessionID/abort
```
Abort an active session and stop any ongoing AI processing.

**Response:** `true`

---

### Fork Session
```
POST /session/:sessionID/fork
```
Create a new session by forking an existing session.

---

### Initialize Session
```
POST /session/:sessionID/init
```
Analyze the current application and create an AGENTS.md file.

---

### Get Session Messages
```
GET /session/:sessionID/message
```
Retrieve all messages in a session.

**Query Parameters:**
- `limit` - Maximum number of messages

---

### Get Single Message
```
GET /session/:sessionID/message/:messageID
```
Retrieve a specific message from a session.

---

### Send Message (Streaming)
```
POST /session/:sessionID/message
```
Send a message and stream the AI response. Returns a streaming response.

**Request Body:**
```json
{
  "parts": [
    { "type": "text", "text": "Hello, help me with..." }
  ],
  "agent": "build",  // or "explore", "edit"
  "model": {
    "providerID": "opencode",
    "modelID": "big-pickle"
  }
}
```

**Response:** JSON stream with message info and parts.

---

### Send Async Message
```
POST /session/:sessionID/prompt_async
```
Send a message asynchronously, returns immediately.

---

### Send Command
```
POST /session/:sessionID/command
```
Send a command to the session for AI execution.

**Request Body:**
```json
{
  "command": "Your command here"
}
```

---

### Run Shell Command
```
POST /session/:sessionID/shell
```
Execute a shell command within the session context.

**Request Body:**
```json
{
  "command": "ls -la"
}
```

---

### Get Session Diff
```
GET /session/:sessionID/diff?messageID=:messageID
```
Get file changes (diff) that resulted from a specific user message.

---

### Revert Message
```
POST /session/:sessionID/revert
```
Revert a specific message in a session.

**Request Body:**
```json
{
  "messageID": "message_id"
}
```

---

### Restore Reverted Messages
```
POST /session/:sessionID/unrevert
```
Restore all previously reverted messages.

---

### Summarize Session
```
POST /session/:sessionID/summarize
```
Generate a concise summary of the session using AI compaction.

**Request Body:**
```json
{
  "providerID": "opencode",
  "modelID": "big-pickle",
  "auto": false
}
```

---

### Share Session
```
POST /session/:sessionID/share
```
Create a shareable link for a session.

---

### Unshare Session
```
DELETE /session/:sessionID/share
```
Remove the shareable link for a session.

---

### Get Session Children
```
GET /session/:sessionID/children
```
Retrieve all child sessions forked from a parent.

---

### Get Session Todos
```
GET /session/:sessionID/todo
```
Retrieve the todo list associated with a session.

---

### Get Session Status
```
GET /session/status
```
Get current status of all sessions.

**Response:**
```json
{
  "session_id": {
    "status": "idle" | "active" | "error",
    ...
  }
}
```

---

## Events (SSE)

### Subscribe to Events
```
GET /event?sessionID=:sessionID
```
Subscribe to real-time events for a session using Server-Sent Events.

**Headers:**
- `Accept: text/event-stream`
- `x-opencode-directory: /path/to/workspace` (optional)

### Event Types

| Event Type | Description |
|------------|-------------|
| `server.connected` | Client connected to event stream |
| `server.heartbeat` | Heartbeat (sent every 30s) |
| `message.part.updated` | Text/reasoning/tool part updated |
| `message.created` | New message created |
| `session.status` | Session status changed |
| `session.diff` | File changes occurred |
| `question.asked` | AI is asking a question |
| `question.replied` | Question was answered |
| `question.rejected` | Question was rejected |
| `permission.asked` | Permission request from AI |
| `permission.replied` | Permission response |
| `session.created` | New session created |
| `session.updated` | Session updated |
| `session.deleted` | Session deleted |
| `session.error` | Session error |

### message.part.updated Properties

The `message.part.updated` event contains a `part` object with:

```json
{
  "type": "text" | "reasoning" | "tool" | "step-start" | "step-finish",
  "id": "part_id",
  "messageID": "message_id",
  "text": "content",        // for text/reasoning types
  "tool": "tool_name",      // for tool type
  "input": {},              // tool input/arguments
  "state": {                // tool execution state
    "status": "pending" | "running" | "completed" | "error"
  }
}
```

### session.status Properties

```json
{
  "status": "idle" | "active" | "error",
  "error": { "message": "error message" }  // only when status is error
}
```

---

## Questions

### List Pending Questions
```
GET /question
```
Get all pending question requests across all sessions.

---

### Reply to Question
```
POST /question/:requestID/reply
```
Provide answers to a question request from the AI.

**Request Body:**
```json
{
  "answers": [
    { "questionID": "q1", "answer": "Answer to q1" },
    { "questionID": "q2", "answer": "Answer to q2" }
  ]
}
```

**Response:** `true`

---

### Reject Question
```
POST /question/:requestID/reject
```
Reject a question request from the AI.

**Response:** `true`

---

## Permissions

### List Pending Permissions
```
GET /permission
```
Get all pending permission requests.

---

### Respond to Permission
```
POST /permission/:requestID/reply
```
Approve or deny a permission request.

**Request Body:**
```json
{
  "reply": "once" | "always" | "reject",
  "message": "optional message"
}
```

**Response:** `true`

---

## Providers

### List Providers
```
GET /provider
```
Get all available AI providers.

**Response:**
```json
{
  "all": [...],
  "default": { "opencode": "big-pickle", ... },
  "connected": ["opencode", ...]
}
```

---

### Get Provider Auth Methods
```
GET /provider/auth
Get available authentication methods for all providers.

```
---

### OAuth Authorize
```
POST /provider/:providerID/oauth/authorize
```
Initiate OAuth authorization.

**Request Body:**
```json
{
  "method": 0
}
```

---

### OAuth Callback
```
POST /provider/:providerID/oauth/callback
```
Handle OAuth callback.

**Request Body:**
```json
{
  "method": 0,
  "code": "authorization_code"
}
```

---

## Configuration

### Get Global Config
```
GET /global/config
```
Get global OpenCode configuration.

---

### Update Global Config
```
PATCH /global/config
```
Update global configuration.

---

### Get Health
```
GET /global/health
```
Get server health information.

**Response:**
```json
{
  "healthy": true,
  "version": "1.0.0"
}
```

---

### Get Path Info
```
GET /path
```
Get current working directory and related paths.

**Response:**
```json
{
  "home": "/home/user",
  "state": "/home/user/.config/opencode",
  "config": "/home/user/.config/opencode/config.json",
  "worktree": "/path/to/worktree",
  "directory": "/path/to/workspace"
}
```

---

### Get VCS Info
```
GET /vcs
```
Get version control information (git branch).

**Response:**
```json
{
  "branch": "main"
}
```

---

### Get Commands
```
GET /command
```
Get list of all available commands.

---

### Get Agents
```
GET /agent
```
Get list of all available AI agents.

---

### Get Skills
```
GET /skill
```
Get list of all available skills.

---

### Get LSP Status
```
GET /lsp
```
Get LSP server status.

---

### Get Formatter Status
```
GET /formatter
```
Get formatter status.

---

## Other Endpoints

### Set Auth Credentials
```
PUT /auth/:providerID
```
Set authentication credentials for a provider.

---

### Remove Auth Credentials
```
DELETE /auth/:providerID
```
Remove authentication credentials.

---

### Dispose Instance
```
POST /instance/dispose
```
Clean up and dispose the current instance.

---

### Dispose All Instances
```
POST /global/dispose
```
Dispose all OpenCode instances.

---

### Write Log
```
POST /log
```
Write a log entry to server logs.

**Request Body:**
```json
{
  "service": "my-service",
  "level": "info",
  "message": "Log message",
  "extra": { "key": "value" }
}
```

---

## SSE Event Flow for Chat

1. **Connect** to `/event?sessionID=:sessionID`
2. **Send message** via `POST /session/:sessionID/message`
3. **Receive events**:
   - `message.part.updated` - Streamed text/reasoning/tools
   - `session.status` - Status changes ("idle", "active", "error")
   - `session.diff` - File changes
   - `question.asked` - AI asking user a question
   - `permission.asked` - Permission request

---

## Example: Complete Chat Flow

```typescript
// 1. Create session
const sessionRes = await fetch('http://localhost:4096/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ directory: '/path/to/project' })
});
const { id: sessionId } = await sessionRes.json();

// 2. Connect to SSE
const eventSource = new EventSource(`http://localhost:4096/event?sessionID=${sessionId}`);
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle message.part.updated, session.status, etc.
};

// 3. Send message
await fetch(`http://localhost:4096/session/${sessionId}/message`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-opencode-directory': '/path/to/project'
  },
  body: JSON.stringify({
    parts: [{ type: 'text', text: 'Help me with...' }],
    agent: 'build'
  })
});

// 4. Abort if needed
await fetch(`http://localhost:4096/session/${sessionId}/abort`, {
  method: 'POST'
});
```

---

## Notes

- The agent runs on a dynamic port (defaults to 4096, but can change)
- All endpoints except `/global/health` require a `directory` parameter via:
  - Query: `?directory=/path/to/workspace`
  - Header: `x-opencode-directory: /path/to/workspace`
- SSE connections should expect heartbeats every 30 seconds
- When a question is asked, capture the `id` from the event and use `/question/:id/reply` to answer
