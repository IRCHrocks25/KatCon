# KatCon API Documentation

## Overview

KatCon provides a comprehensive REST API for internal team communication and project management. All API endpoints require authentication via JWT tokens and implement rate limiting.

## Authentication

All API endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### Authentication Middleware
- **JWT Validation**: Tokens are validated using Supabase Auth
- **User Approval Check**: Only approved users can access protected endpoints
- **Rate Limiting**: All endpoints are protected by configurable rate limits

## Rate Limiting

All API endpoints implement rate limiting:

| Limiter Type | Window | Max Requests | Description |
|-------------|--------|--------------|-------------|
| `strictRateLimit` | 1 minute | 10 requests | Critical operations |
| `moderateRateLimit` | 1 minute | 60 requests | Standard API calls |
| `lenientRateLimit` | 1 minute | 120 requests | High-frequency operations |
| `fileUploadRateLimit` | 1 minute | 20 requests | File upload operations |
| `realtimeRateLimit` | 1 minute | 300 requests | Real-time operations |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Timestamp when limit resets

## Error Handling

All endpoints return standardized error responses:

```json
{
  "error": "Error message description",
  "details": "Optional detailed error information"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (invalid/missing token)
- `403`: Forbidden (insufficient permissions)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

## API Endpoints

### Health Check

#### GET /api/health
Basic health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:34:56.789Z",
  "uptime": 1234.567,
  "version": "1.0.0"
}
```

---

## User Management

### GET /api/users/list
List all users (authenticated users only).

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "fullname": "John Doe",
      "username": "johndoe",
      "accountType": "CRM",
      "role": "user",
      "approved": true,
      "lastSeen": "2024-01-15T12:34:56.789Z"
    }
  ]
}
```

### GET /api/check-user
Check current user information.

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullname": "John Doe",
    "accountType": "CRM",
    "role": "user",
    "approved": true
  }
}
```

### POST /api/user/update-expired-statuses
Update expired user statuses (internal/background).

---

## Profile Management

### PUT /api/profile/update
Update user profile information.

**Request:**
```json
{
  "fullname": "John Doe",
  "username": "johndoe",
  "accountType": "CRM"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullname": "John Doe",
    "username": "johndoe",
    "accountType": "CRM"
  }
}
```

### POST /api/profile/upload-avatar
Upload user avatar image.

**Content-Type:** `multipart/form-data`
**Form Field:** `avatar` (file)

**Response:**
```json
{
  "avatarUrl": "https://supabase-url/avatar-uuid.jpg"
}
```

---

## Admin Endpoints

*Requires admin or manager role*

### GET /api/admin/users
List all users with admin controls.

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "fullname": "John Doe",
      "accountType": "CRM",
      "role": "user",
      "approved": false,
      "created_at": "2024-01-15T12:34:56.789Z"
    }
  ]
}
```

### POST /api/admin/users
Update user status/role (approve, reject, change role).

**Request:**
```json
{
  "userId": "uuid",
  "action": "approve|reject|update_role",
  "role": "user|admin|manager"
}
```

### GET /api/admin/reminders
Admin view of all reminders (for moderation).

---

## Task/Reminder Management

### POST /api/reminders/create
Create a new reminder/task.

**Request:**
```json
{
  "title": "Complete project proposal",
  "description": "Write and review the Q1 project proposal",
  "dueDate": "2024-01-20T17:00:00.000Z",
  "assignedTo": ["user1@example.com", "team:CRM"],
  "channelId": "channel-uuid",
  "clientId": "client-uuid",
  "priority": "high",
  "isRecurring": false,
  "rrule": null
}
```

**Response:**
```json
{
  "id": "reminder-uuid",
  "title": "Complete project proposal",
  "description": "Write and review the Q1 project proposal",
  "dueDate": "2024-01-20T17:00:00.000Z",
  "status": "backlog",
  "priority": "high",
  "createdBy": "creator@example.com",
  "assignedTo": ["user1@example.com", "user2@example.com"],
  "channelId": "channel-uuid",
  "clientId": "client-uuid",
  "createdAt": "2024-01-15T12:34:56.789Z",
  "isRecurring": false
}
```

### POST /api/reminders/update-status
Update reminder status.

**Request:**
```json
{
  "id": "reminder-uuid",
  "status": "in_progress"
}
```

### DELETE /api/reminders/delete
Soft delete a reminder (set status to 'hidden').

**Request:**
```json
{
  "id": "reminder-uuid"
}
```

### POST /api/reminders/process-recurring
Process recurring reminders (internal/background).

### POST /api/reminders/notify-stale
Send notifications for stale reminders (internal/background).

---

## Messaging System

### GET /api/messaging/conversations
List user conversations/channels.

**Response:**
```json
{
  "conversations": [
    {
      "id": "channel-uuid",
      "name": "general",
      "type": "channel",
      "lastMessage": {
        "content": "Hello world",
        "timestamp": "2024-01-15T12:34:56.789Z",
        "sender": "user@example.com"
      },
      "unreadCount": 5,
      "participants": ["user1@example.com", "user2@example.com"]
    }
  ]
}
```

### POST /api/messaging/conversations
Create a new conversation/channel.

**Request:**
```json
{
  "name": "project-alpha",
  "type": "channel",
  "participants": ["user1@example.com", "user2@example.com"]
}
```

### GET /api/messaging/conversations/[id]
Get conversation details and participants.

### POST /api/messaging/conversations/[id]/participants
Add participants to a conversation.

**Request:**
```json
{
  "participants": ["user@example.com"]
}
```

### GET /api/messaging/messages/[conversationId]
Get messages for a conversation.

**Query Parameters:**
- `limit`: Number of messages to return (default: 50)
- `before`: Message ID to paginate backwards from

**Response:**
```json
{
  "messages": [
    {
      "id": "message-uuid",
      "content": "Hello team!",
      "sender": {
        "email": "user@example.com",
        "fullname": "John Doe"
      },
      "timestamp": "2024-01-15T12:34:56.789Z",
      "type": "text",
      "reactions": [
        {
          "emoji": "👍",
          "users": ["user1@example.com", "user2@example.com"]
        }
      ]
    }
  ],
  "hasMore": true
}
```

### POST /api/messaging/messages/[conversationId]
Send a message to a conversation.

**Request:**
```json
{
  "content": "Hello team!",
  "type": "text"
}
```

### PUT /api/messaging/messages/[messageId]/read
Mark a message as read.

### GET /api/messaging/read/[conversationId]
Mark all messages in a conversation as read.

### POST /api/messaging/reactions
Add/remove reaction to a message.

**Request:**
```json
{
  "messageId": "message-uuid",
  "emoji": "👍",
  "action": "add" // or "remove"
}
```

### GET /api/messaging/pinned
Get pinned messages.

### POST /api/messaging/pinned
Pin/unpin a message.

**Request:**
```json
{
  "messageId": "message-uuid",
  "action": "pin" // or "unpin"
}
```

### POST /api/messaging/files/[conversationId]
Upload a file to a conversation.

**Content-Type:** `multipart/form-data`
**Form Fields:**
- `file`: The file to upload
- `message`: Optional message text

### GET /api/messaging/search
Search messages across conversations.

**Query Parameters:**
- `query`: Search term
- `channelId`: Optional channel to search in

---

## Notification System

### GET /api/notifications/list
Get user notifications.

**Query Parameters:**
- `limit`: Number of notifications (default: 50)
- `unreadOnly`: Only return unread notifications

**Response:**
```json
{
  "notifications": [
    {
      "id": "notification-uuid",
      "type": "reminder_assigned",
      "title": "New Reminder Assigned",
      "message": "You were assigned to: Complete project proposal",
      "read": false,
      "created_at": "2024-01-15T12:34:56.789Z",
      "reminder_id": "reminder-uuid",
      "metadata": {
        "task_id": "reminder-uuid",
        "due_date": "2024-01-20T17:00:00.000Z"
      }
    }
  ]
}
```

### PUT /api/notifications/mark-read
Mark notifications as read.

**Request:**
```json
{
  "notificationIds": ["notification-uuid-1", "notification-uuid-2"]
}
```

### POST /api/notifications/update-unread-messages
Update unread message counts (internal).

---

## Client Management

*Requires admin or manager role*

### GET /api/clients
List all clients.

**Response:**
```json
{
  "clients": [
    {
      "id": "client-uuid",
      "name": "Acme Corp",
      "contact_email": "contact@acme.com",
      "contact_phone": "+1-555-0123",
      "industry": "Technology",
      "status": "active",
      "created_at": "2024-01-15T12:34:56.789Z"
    }
  ]
}
```

### POST /api/clients
Create a new client.

**Request:**
```json
{
  "name": "Acme Corp",
  "contact_email": "contact@acme.com",
  "contact_phone": "+1-555-0123",
  "industry": "Technology",
  "notes": "Enterprise client"
}
```

### GET /api/clients/[id]
Get client details.

### PUT /api/clients/[id]
Update client information.

**Request:**
```json
{
  "name": "Updated Corp Name",
  "status": "inactive"
}
```

---

## Legacy Messaging Endpoints

*These endpoints are maintained for backward compatibility*

### GET /api/conversations/[id]
Get conversation details.

### GET /api/conversations/create
Create conversation.

### GET /api/conversations/list
List conversations.

### GET /api/messages/[conversationId]
Get conversation messages.

### GET /api/messages/[messageId]
Get specific message.

### PUT /api/messages/[messageId]/read
Mark message as read.

### GET /api/messages/read/[messageId]
Mark message as read.

---

## Data Models

### User Profile
```typescript
interface UserProfile {
  id: string;
  email: string;
  fullname?: string;
  username?: string;
  accountType: "CRM" | "DEV" | "PM" | "AI" | "DESIGN";
  role: "user" | "admin" | "manager";
  approved: boolean;
  avatar_url?: string;
  last_seen?: string;
  created_at: string;
}
```

### Reminder/Task
```typescript
interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate?: Date;
  status: "backlog" | "in_progress" | "review" | "done" | "hidden";
  priority: "low" | "medium" | "high" | "urgent";
  createdBy: string;
  assignedTo: string[];
  channelId?: string;
  clientId?: string;
  createdAt: Date;
  isRecurring?: boolean;
  rrule?: string;
}
```

### Message
```typescript
interface Message {
  id: string;
  content: string;
  sender: {
    email: string;
    fullname?: string;
  };
  timestamp: Date;
  type: "text" | "file";
  reactions?: Array<{
    emoji: string;
    users: string[];
  }>;
  file?: {
    name: string;
    size: number;
    type: string;
    url: string;
  };
}
```

### Notification
```typescript
interface Notification {
  id: string;
  type: "reminder_assigned" | "reminder_overdue" | "message_mention" | "deadline_approaching";
  title: string;
  message: string;
  read: boolean;
  created_at: Date;
  reminder_id?: string;
  metadata?: Record<string, any>;
}
```

### Client
```typescript
interface Client {
  id: string;
  name: string;
  contact_email?: string;
  contact_phone?: string;
  industry?: string;
  status: "active" | "inactive";
  notes?: string;
  created_at: Date;
  updated_at: Date;
}
```

---

## WebSocket/Real-time Events

KatCon uses Supabase Realtime for live updates:

### Task Updates
- **Channel:** `reminders`
- **Events:** `INSERT`, `UPDATE`, `DELETE`
- **Triggers:** Automatic UI updates for task changes

### Message Updates
- **Channel:** `messages`
- **Events:** `INSERT`, `UPDATE`
- **Triggers:** Live message delivery, typing indicators

### User Status Updates
- **Channel:** `user_status`
- **Events:** `UPDATE`
- **Triggers:** Online/offline status changes

### Notification Updates
- **Channel:** `notifications`
- **Events:** `INSERT`
- **Triggers:** Live notification delivery

---

## File Upload Specifications

### Supported Formats
- **Images:** JPEG, PNG, GIF, WebP, SVG
- **Documents:** PDF, TXT, MD, DOC, DOCX, XLS, XLSX
- **Archives:** ZIP

### Size Limits
- **Maximum file size:** 10MB
- **Rate limit:** 20 uploads per minute per user

### Upload Process
1. POST file to `/api/messaging/files/[conversationId]`
2. File is uploaded to Supabase Storage
3. File metadata is stored in database
4. File URL is returned for display

---

## Security Features

### Authentication
- JWT-based authentication via Supabase Auth
- Automatic token refresh
- Session validation on each request

### Authorization
- Role-based access control (User/Admin/Manager)
- Row-level security (RLS) policies in database
- User approval workflow for new registrations

### Data Protection
- All data scoped to authenticated users
- Encrypted data transmission (HTTPS)
- Input validation and sanitization
- SQL injection prevention

### Rate Limiting
- Per-endpoint rate limiting
- IP-based tracking
- Configurable limits per operation type

---

## Error Codes Reference

| Error Code | Description |
|------------|-------------|
| `INVALID_TOKEN` | JWT token is invalid or expired |
| `USER_NOT_APPROVED` | User account is pending approval |
| `INSUFFICIENT_PERMISSIONS` | User lacks required role/permissions |
| `RATE_LIMIT_EXCEEDED` | Too many requests in time window |
| `VALIDATION_ERROR` | Request data failed validation |
| `RESOURCE_NOT_FOUND` | Requested resource doesn't exist |
| `DUPLICATE_RESOURCE` | Resource already exists |
| `FILE_TOO_LARGE` | Uploaded file exceeds size limit |
| `UNSUPPORTED_FILE_TYPE` | File type not allowed |

---

## Development Notes

### Environment Variables
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Testing
- Use `npm run test` for unit tests
- Use `npm run test:security` for security testing
- Health check available at `/api/health`

### Deployment
- Automatic deployments via GitHub Actions
- Environment-specific configurations
- Database migrations run automatically

---

## Changelog

### Version 1.0.0
- Initial API documentation
- Core messaging, task management, and user management endpoints
- Authentication and authorization system
- Rate limiting and security features
- Real-time updates via Supabase Realtime
