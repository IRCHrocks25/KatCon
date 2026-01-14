import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const POST = async () => {
  try {
    const supabase = createServerClient();
    const now = new Date();

    // Get recurring reminders that are due (due_date is in the past)
    const { data: dueReminders, error: fetchError } = await supabase
      .from('reminders')
      .select('*')
      .eq('is_recurring', true)
      .lt('due_date', now.toISOString());

    if (fetchError) {
      console.error('Error fetching due recurring reminders:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 });
    }

    console.log(`[RECURRING] Found ${dueReminders?.length || 0} due recurring reminders`);

    let processedCount = 0;
    let errorCount = 0;

    for (const reminder of dueReminders || []) {
      try {
        console.log(`[RECURRING] Processing reminder ${reminder.id}: ${reminder.title}`);
        console.log(`[RECURRING] Current due: ${reminder.due_date}`);

        // Calculate next occurrence: tomorrow at the exact same time
        const currentDueDate = new Date(reminder.due_date);
        const nextDueDate = new Date(currentDueDate);
        nextDueDate.setDate(nextDueDate.getDate() + 1); // Add one day

        console.log(`[RECURRING] Next due: ${nextDueDate.toISOString()}`);

        // Update the existing reminder's due_date to tomorrow at the same time
        const { error: updateError } = await supabase
          .from('reminders')
          .update({
            due_date: nextDueDate.toISOString(),
            status: 'backlog', // Reset status to backlog for the new occurrence
            last_status_change_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', reminder.id);

        if (updateError) {
          console.error(`[RECURRING] Error updating reminder ${reminder.id}:`, updateError);
          errorCount++;
          continue;
        }

        // Reset all assignments to backlog status for the new occurrence
        const { error: resetAssignmentsError } = await supabase
          .from('reminder_assignments')
          .update({ status: 'backlog' })
          .eq('reminder_id', reminder.id);

        if (resetAssignmentsError) {
          console.error(`[RECURRING] Error resetting assignments for reminder ${reminder.id}:`, resetAssignmentsError);
          // Don't count this as a fatal error, just log it
        }

        processedCount++;
        console.log(`[RECURRING] ✅ Successfully updated reminder ${reminder.id} to next occurrence`);

      } catch (error) {
        console.error(`[RECURRING] Error processing reminder ${reminder.id}:`, error);
        errorCount++;
      }
    }

    console.log(`[RECURRING] Processing complete: ${processedCount} processed, ${errorCount} errors`);

    return NextResponse.json({
      success: true,
      processed: processedCount,
      errors: errorCount,
      total: dueReminders?.length || 0
    });

  } catch (error) {
    console.error('[RECURRING] Unexpected error in process-recurring:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
