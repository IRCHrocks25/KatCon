-- Fix UPDATE policy to allow updating reminders to 'hidden' status
-- This migration ensures the WITH CHECK clause doesn't conflict with SELECT policy

-- First, ensure the status constraint includes 'hidden'
ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_status_check;

ALTER TABLE public.reminders 
  ADD CONSTRAINT reminders_status_check 
  CHECK (status IN ('pending', 'done', 'hidden'));

-- Create a function to update reminder status that bypasses RLS check issues
CREATE OR REPLACE FUNCTION public.update_reminder_status(
  reminder_id UUID,
  new_status TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the reminder belongs to the current user
  IF NOT EXISTS (
    SELECT 1 FROM public.reminders 
    WHERE id = reminder_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Reminder not found or access denied';
  END IF;

  -- Update the status
  UPDATE public.reminders
  SET status = new_status,
      updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = reminder_id AND user_id = auth.uid();
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_reminder_status(UUID, TEXT) TO authenticated;

-- Drop and recreate UPDATE policy (still needed for regular updates)
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;

CREATE POLICY "Users can update own reminders"
  ON public.reminders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Also ensure SELECT policy excludes hidden (for fetching)
DROP POLICY IF EXISTS "Users can view own reminders" ON public.reminders;

CREATE POLICY "Users can view own reminders"
  ON public.reminders
  FOR SELECT
  USING (auth.uid() = user_id AND status != 'hidden');

