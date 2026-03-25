# Performance Tracker

A React-based performance tracking application for contracting division staff with Supabase backend.

## Features

- **Dashboard**: Monthly performance overview with charts and analytics
- **Stats and Figures**: Comprehensive accountant performance monitoring
- **Annual Summary**: Year-to-date performance analysis
- **User Tracker**: Individual daily activity tracking
- **Targets Control**: Admin interface for setting monthly targets
- **Authentication**: Secure Email/Password authentication via Supabase

## Tech Stack

- React 18 with TypeScript
- Tailwind CSS for styling
- Supabase for backend and authentication
- React Router for navigation
- Vite for build tooling

## Quick Start

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables in `.env`
4. Run development server: `npm run dev`
5. Build for production: `npm run build`

## Environment Variables

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
VITE_SUPABASE_PROJECT_ID=your_project_id
```

## Database Schema

The application uses the following Supabase tables:
- `staff` - User information and roles
- `teams` - Accountant groupings
- `services` - Service types (Accounts, VAT, Self Assessments)
- `daily_activity` - Daily performance entries
- `monthly_targets` - Monthly targets per user/accountant/service
- `working_days` - Working day calendar

## Deployment

### Vercel
1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

### Netlify
1. Connect your repository to Netlify
2. Configuration is handled by `netlify.toml`
3. Deploy automatically on push

## User Roles

- **Admin**: Full access to all features including accountant management and targets
- **User**: Access to personal tracker and read-only accountant views

## Authentication

Users authenticate via Email and Password through Supabase Auth. User records must be created in the database and linked to user accounts via the `user_id` field.

**Default Admin Account:**
- **Email:** `rowan@thecrew.co.uk`
- **Password:** `Rowan123!` *(Please change this in Settings after logging in)*

Admins can create new users and manage existing staff members directly from the Settings page.