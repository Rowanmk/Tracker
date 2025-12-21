# Performance Tracker

A React-based performance tracking application for contracting division staff with Supabase backend.

## Features

- **Dashboard**: Monthly performance overview with charts and analytics
- **Team View**: Comprehensive team performance monitoring
- **Annual Summary**: Year-to-date performance analysis
- **Staff Tracker**: Individual daily activity tracking
- **Targets Control**: Admin interface for setting monthly targets
- **Authentication**: Google OAuth integration via Supabase

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
- `staff` - Staff member information and roles
- `services` - Service types (Accounts, VAT, Self Assessments)
- `daily_activity` - Daily performance entries
- `monthly_targets` - Monthly targets per staff/service
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

- **Admin**: Full access to all features including team management and targets
- **Staff**: Access to personal tracker and read-only team views

## Authentication

Users authenticate via Google OAuth through Supabase Auth. Staff records must be created in the database and linked to user accounts via the `user_id` field.