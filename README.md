# KatCon - Internal Team Communication & Project Management Platform

A modern, full-featured internal communication and project management platform built with Next.js 16, React 19, TypeScript, and Supabase.

## 🚀 Features

### 💬 **Real-time Messaging**
- Public channels and private direct messages
- Threaded conversations with replies
- File sharing and attachments
- Message reactions and pinning
- Full-text search across conversations
- Real-time notifications

### 📋 **Task & Project Management**
- Comprehensive task creation with due dates and assignments
- Kanban board with drag-and-drop functionality
- Team and individual task assignments
- Task status tracking (Backlog → In Progress → Review → Done)
- Real-time task updates and notifications

### 🤖 **AI-Powered Assistant**
- Natural language task creation
- Project status inquiries
- Automated reminder creation from conversations
- Intelligent suggestions and queries

### 👥 **User Management & Administration**
- Role-based access control (User/Admin)
- User approval workflow for new registrations
- Admin dashboard for user management
- Account type management (CRM, DEV, PM, AI, DESIGN, etc.)
- Secure user lifecycle management

### 🔔 **Notifications System**
- Real-time notifications for all activities
- Message notifications and task assignments
- Customizable notification preferences
- Unread message counters and badges

### 🔐 **Security & Privacy**
- Supabase authentication with JWT tokens
- Row-level security (RLS) policies
- Rate limiting on all API endpoints
- User-scoped data isolation
- Automatic session management

## 🛠️ Technology Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime subscriptions
- **Authentication**: Supabase Auth
- **File Storage**: Supabase Storage
- **UI Components**: Custom components with Lucide icons
- **Animations**: Framer Motion

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account and project

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd katcon
npm install
```

### 2. Environment Setup

Create a `.env.local` file with your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Setup Admin Functionality

Run the automated setup script:

```bash
npm run setup-admin
```

This will:
- Run the database migration to add admin role support
- Set up all necessary database changes

### 4. Create Admin User

```bash
npm run create-admin admin@company.com securepassword123 "Admin User"
```

**Alternative Manual Setup:**
If you prefer to run the migration manually:
1. Open your Supabase dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `database/migrations/add_admin_role.sql`

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with your admin credentials.

## 👤 User Roles

### Regular Users
- Send/receive messages
- Create and manage tasks
- Participate in channels
- Update profile information

### Admin Users
- All regular user permissions
- Approve/reject new user registrations
- Manage user roles and account types
- View system-wide user statistics
- Access admin dashboard

## 📁 Project Structure

```
katcon/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── admin/         # Admin-only endpoints
│   │   └── messaging/     # Messaging endpoints
│   └── (pages)/           # App pages
├── components/            # React components
│   ├── admin/            # Admin dashboard
│   ├── auth/             # Authentication
│   ├── chat/             # AI chat interface
│   ├── messaging/        # Chat/messaging UI
│   ├── notifications/    # Notification system
│   └── reminders/        # Task management
├── contexts/             # React contexts
├── database/             # Database migrations
├── lib/                  # Utility libraries
│   ├── supabase/         # Supabase client & utilities
│   └── utils/            # General utilities
└── scripts/              # Setup and admin scripts
```

## 🔧 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run setup-admin  # Run database migration for admin functionality
npm run create-admin # Create admin user
```

## 🔒 Security Features

- **Rate Limiting**: All API endpoints protected with configurable rate limits
- **User Isolation**: Chat data and preferences scoped to individual users
- **Session Management**: Automatic session cleanup and validation
- **Row Level Security**: Database-level access control
- **Input Validation**: Comprehensive client and server-side validation

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login

### Admin Endpoints (Admin Only)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Update user status/role

### Messaging Endpoints
- `GET /api/messaging/messages/[id]` - Get conversation messages
- `POST /api/messaging/messages/[id]` - Send message

### Task Management
- `POST /api/reminders/create` - Create new task
- `POST /api/reminders/update-status` - Update task status

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push

### Manual Deployment
1. Build the application: `npm run build`
2. Start production server: `npm run start`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is proprietary software. All rights reserved.

## ⚠️ Important Notes

- **Admin Setup Required**: New installations require running the admin creation script
- **Database Migration**: Run the SQL migration for admin functionality
- **Environment Variables**: Never commit `.env.local` to version control
- **User Approval**: New user registrations require admin approval before login

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section in docs
2. Review Supabase logs for database issues
3. Check browser console for client-side errors
4. Create an issue in the repository
