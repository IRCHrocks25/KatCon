-- Fix RLS policies to allow updating reminders to 'done' status
-- The issue is that the SELECT policy filters out 'done' reminders,
-- which prevents reading back the updated row

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view own pending reminders" ON public.reminders;

-- Create a new SELECT policy that allows viewing all reminders (including done)
-- This is needed for UPDATE operations to read back the updated row
CREATE POLICY "Users can view own reminders"
  ON public.reminders
  FOR SELECT
  USING (auth.uid() = user_id);

-- The UPDATE policy should already work, but let's make sure it's correct
-- Drop and recreate to ensure it's properly configured
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;

CREATE POLICY "Users can update own reminders"
  ON public.reminders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

