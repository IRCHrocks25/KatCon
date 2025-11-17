-- Complete RLS Policies for Reminders and Notifications System
-- Run this SQL in your Supabase SQL Editor

-- =====================================================
-- NOTIFICATIONS TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role full access on notifications" ON public.notifications;

-- Policy 1: Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications
  FOR SELECT
  USING (user_email = auth.jwt() ->> 'email');

-- Policy 2: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
  ON public.notifications
  FOR UPDATE
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

-- Policy 3: Service role can do anything (for backend notification creation)
CREATE POLICY "Service role full access on notifications"
  ON public.notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- =====================================================
-- REMINDERS TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on reminders table
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update their reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete their own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Service role full access on reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can insert their own reminders" ON public.reminders;

-- Policy 1: Users can view reminders they created OR are assigned to
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

-- Policy 2: Users can insert their own reminders
CREATE POLICY "Users can insert their own reminders"
  ON public.reminders
  FOR INSERT
  WITH CHECK (user_id = auth.jwt() ->> 'email');

-- Policy 3: Users can update reminders they created OR are assigned to
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

-- Policy 4: Only creators can delete their reminders
CREATE POLICY "Users can delete their own reminders"
  ON public.reminders
  FOR DELETE
  USING (user_id = auth.jwt() ->> 'email');

-- Policy 5: Service role can do anything (for backend operations)
CREATE POLICY "Service role full access on reminders"
  ON public.reminders
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

-- =====================================================
-- REMINDER_ASSIGNMENTS TABLE RLS POLICIES
-- =====================================================

-- Enable RLS on reminder_assignments table
ALTER TABLE public.reminder_assignments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their assignments" ON public.reminder_assignments;
DROP POLICY IF EXISTS "Users can update their own assignments" ON public.reminder_assignments;
DROP POLICY IF EXISTS "Service role full access on assignments" ON public.reminder_assignments;
DROP POLICY IF EXISTS "Users can insert assignments for their reminders" ON public.reminder_assignments;

-- Policy 1: Users can view assignments where they are assigned or are the creator
CREATE POLICY "Users can view their assignments"
  ON public.reminder_assignments
  FOR SELECT
  USING (
    user_email = auth.jwt() ->> 'email'
    OR
    reminder_id IN (
      SELECT id FROM public.reminders WHERE user_id = auth.jwt() ->> 'email'
    )
  );

-- Policy 2: Users can insert assignments for reminders they created
CREATE POLICY "Users can insert assignments for their reminders"
  ON public.reminder_assignments
  FOR INSERT
  WITH CHECK (
    reminder_id IN (
      SELECT id FROM public.reminders WHERE user_id = auth.jwt() ->> 'email'
    )
  );

-- Policy 3: Users can update their own assignment status (mark complete, etc.)
CREATE POLICY "Users can update their own assignments"
  ON public.reminder_assignments
  FOR UPDATE
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

-- Policy 4: Users can delete assignments for reminders they created
CREATE POLICY "Users can delete assignments for their reminders"
  ON public.reminder_assignments
  FOR DELETE
  USING (
    reminder_id IN (
      SELECT id FROM public.reminders WHERE user_id = auth.jwt() ->> 'email'
    )
  );

-- Policy 5: Service role can do anything (for backend operations)
CREATE POLICY "Service role full access on assignments"
  ON public.reminder_assignments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_assignments TO authenticated;
GRANT ALL ON public.reminder_assignments TO service_role;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- View all policies (run this to verify they were created)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('notifications', 'reminders', 'reminder_assignments')
ORDER BY tablename, policyname;

