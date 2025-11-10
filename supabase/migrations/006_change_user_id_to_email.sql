-- Create a helper function to get user email (with SECURITY DEFINER to access auth.users)
CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email FROM auth.users WHERE id = auth.uid();
  RETURN user_email;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_email() TO authenticated;

-- Drop all existing RLS policies FIRST (before altering column)
DROP POLICY IF EXISTS "Users can view own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can view own pending reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can insert own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;

-- Drop existing constraints and indexes
ALTER TABLE public.reminders DROP CONSTRAINT IF EXISTS reminders_user_id_fkey;
DROP INDEX IF EXISTS reminders_user_id_idx;

-- Change the column type from UUID to TEXT
ALTER TABLE public.reminders 
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Create new index on user_id (now email)
CREATE INDEX IF NOT EXISTS reminders_user_id_idx ON public.reminders(user_id);

-- Create new RLS policies using email
-- Use the helper function to get user email
CREATE POLICY "Users can view own reminders"
  ON public.reminders
  FOR SELECT
  USING (
    user_id = public.get_user_email()
    AND status != 'hidden'
  );

CREATE POLICY "Users can insert own reminders"
  ON public.reminders
  FOR INSERT
  WITH CHECK (
    user_id = public.get_user_email()
  );

CREATE POLICY "Users can update own reminders"
  ON public.reminders
  FOR UPDATE
  USING (
    user_id = public.get_user_email()
  )
  WITH CHECK (
    user_id = public.get_user_email()
  );

CREATE POLICY "Users can delete own reminders"
  ON public.reminders
  FOR DELETE
  USING (
    user_id = public.get_user_email()
  );

-- Update the RPC function if it exists
DROP FUNCTION IF EXISTS public.update_reminder_status(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.update_reminder_status(
  reminder_id UUID,
  new_status TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Get the current user's email using the helper function
  user_email := public.get_user_email();
  
  IF user_email IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Verify the reminder belongs to the current user
  IF NOT EXISTS (
    SELECT 1 FROM public.reminders 
    WHERE id = reminder_id AND user_id = user_email
  ) THEN
    RAISE EXCEPTION 'Reminder not found or access denied';
  END IF;

  -- Update the status
  UPDATE public.reminders
  SET status = new_status,
      updated_at = TIMEZONE('utc'::text, NOW())
  WHERE id = reminder_id AND user_id = user_email;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_reminder_status(UUID, TEXT) TO authenticated;
