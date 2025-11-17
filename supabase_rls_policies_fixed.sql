-- FIXED RLS Policies - No Infinite Recursion
-- Run this SQL in your Supabase SQL Editor

-- =====================================================
-- CLEAR ALL EXISTING POLICIES FIRST
-- =====================================================

-- Drop all policies to start fresh
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role full access on notifications" ON public.notifications;

DROP POLICY IF EXISTS "Users can view their reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can insert their own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update their reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete their own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Service role full access on reminders" ON public.reminders;

DROP POLICY IF EXISTS "Users can view their assignments" ON public.reminder_assignments;
DROP POLICY IF EXISTS "Users can insert assignments for their reminders" ON public.reminder_assignments;
DROP POLICY IF EXISTS "Users can update their own assignments" ON public.reminder_assignments;
DROP POLICY IF EXISTS "Users can delete assignments for their reminders" ON public.reminder_assignments;
DROP POLICY IF EXISTS "Service role full access on assignments" ON public.reminder_assignments;

-- =====================================================
-- NOTIFICATIONS TABLE (Simple - No Recursion Risk)
-- =====================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications
  FOR SELECT
  USING (user_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can update their own notifications"
  ON public.notifications
  FOR UPDATE
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

CREATE POLICY "Service role full access on notifications"
  ON public.notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- =====================================================
-- REMINDER_ASSIGNMENTS TABLE (Simple - No Recursion)
-- =====================================================

ALTER TABLE public.reminder_assignments ENABLE ROW LEVEL SECURITY;

-- Users can only see assignments where THEY are assigned
-- Don't check reminders table (avoids recursion)
CREATE POLICY "Users can view their own assignments"
  ON public.reminder_assignments
  FOR SELECT
  USING (user_email = auth.jwt() ->> 'email');

-- Users can update their own assignments (mark as done)
CREATE POLICY "Users can update their own assignments"
  ON public.reminder_assignments
  FOR UPDATE
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

-- Service role can do anything
CREATE POLICY "Service role full access on assignments"
  ON public.reminder_assignments
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT, UPDATE ON public.reminder_assignments TO authenticated;
GRANT ALL ON public.reminder_assignments TO service_role;

-- =====================================================
-- REMINDERS TABLE (Fixed - No Circular Reference)
-- =====================================================

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Users can view reminders they created OR are assigned to
-- This queries assignments, but assignments policy doesn't query back to reminders
CREATE POLICY "Users can view their reminders"
  ON public.reminders
  FOR SELECT
  USING (
    user_id = auth.jwt() ->> 'email'
    OR
    id IN (
      SELECT reminder_id FROM public.reminder_assignments 
      WHERE user_email = auth.jwt() ->> 'email'
    )
  );

-- Users can insert their own reminders
CREATE POLICY "Users can insert their own reminders"
  ON public.reminders
  FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'email');

-- Users can update reminders they created OR are assigned to
CREATE POLICY "Users can update their reminders"
  ON public.reminders
  FOR UPDATE
  USING (
    user_id = auth.jwt() ->> 'email'
    OR
    id IN (
      SELECT reminder_id FROM public.reminder_assignments 
      WHERE user_email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    user_id = auth.jwt() ->> 'email'
    OR
    id IN (
      SELECT reminder_id FROM public.reminder_assignments 
      WHERE user_email = auth.jwt() ->> 'email'
    )
  );

-- Only creators can delete their reminders
CREATE POLICY "Users can delete their own reminders"
  ON public.reminders
  FOR DELETE
  USING (user_id = auth.jwt() ->> 'email');

-- Service role can do anything (for API routes)
CREATE POLICY "Service role full access on reminders"
  ON public.reminders
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- View all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('notifications', 'reminders', 'reminder_assignments')
ORDER BY tablename, policyname;

