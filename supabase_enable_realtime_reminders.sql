-- Enable Realtime for Reminders System
-- Run this SQL in your Supabase SQL Editor

-- Enable realtime replication for reminders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;

-- Enable realtime replication for reminder_assignments table
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminder_assignments;

-- Note: Make sure Row Level Security (RLS) is enabled on these tables
-- Realtime respects RLS policies, so users will only receive updates for data they can access

