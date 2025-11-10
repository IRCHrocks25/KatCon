-- Add 'hidden' status to reminders table
-- This allows soft-deleting reminders instead of hard-deleting them

-- Drop the existing CHECK constraint
ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_status_check;

-- Add new CHECK constraint with 'hidden' status
ALTER TABLE public.reminders 
  ADD CONSTRAINT reminders_status_check 
  CHECK (status IN ('pending', 'done', 'hidden'));

-- Update the SELECT policy to exclude only hidden reminders (allow done and pending)
DROP POLICY IF EXISTS "Users can view own reminders" ON public.reminders;

CREATE POLICY "Users can view own reminders"
  ON public.reminders
  FOR SELECT
  USING (auth.uid() = user_id AND status != 'hidden');

-- Ensure UPDATE policy allows updating to 'hidden' status
-- WITH CHECK must explicitly allow 'hidden' status since SELECT policy filters it
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;

CREATE POLICY "Users can update own reminders"
  ON public.reminders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
  );

