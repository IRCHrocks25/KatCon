import {  NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { rrulestr } from "rrule";

export const POST = async () => {
  try {
    const supabase = createServerClient();
    const now = new Date();

    // Get recurring reminders that are due (due_date is in the past)
    const { data: dueReminders, error: fetchError } = await supabase
      .from('reminders')
      .select('*')
      .eq('is_recurring', true)
      .lt('due_date', now.toISOString())
      .is('parent_reminder_id', null); // Only process parent recurring reminders

    if (fetchError) {
      console.error('Error fetching due recurring reminders:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 });
    }

    console.log(`[RECURRING] Found ${dueReminders?.length || 0} due recurring reminders`);

    let processedCount = 0;
    let errorCount = 0;

    for (const reminder of dueReminders || []) {
      try {
        // Calculate next occurrence using RRULE
        const nextDate = calculateNextOccurrence(reminder.rrule, reminder.due_date);

        if (!nextDate) {
          console.warn(`[RECURRING] Could not calculate next occurrence for reminder ${reminder.id}`);
          continue;
        }

        console.log(`[RECURRING] Processing reminder ${reminder.id}: ${reminder.title}`);
        console.log(`[RECURRING] Current due: ${reminder.due_date}, Next due: ${nextDate.toISOString()}`);

        // Create new reminder instance with next date
        const { error: insertError } = await supabase
          .from('reminders')
          .insert({
            user_id: reminder.user_id,
            title: reminder.title,
            description: reminder.description,
            due_date: nextDate.toISOString(),
            priority: reminder.priority,
            channel_id: reminder.channel_id,
            is_recurring: true,
            rrule: reminder.rrule,
            parent_reminder_id: reminder.id, // Link to original
            status: 'backlog', // New instances start as backlog
            last_status_change_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error(`[RECURRING] Error creating new instance for ${reminder.id}:`, insertError);
          errorCount++;
          continue;
        }

        // Update the original reminder's due_date to the next occurrence
        const { error: updateError } = await supabase
          .from('reminders')
          .update({
            due_date: nextDate.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', reminder.id);

        if (updateError) {
          console.error(`[RECURRING] Error updating original reminder ${reminder.id}:`, updateError);
          errorCount++;
          continue;
        }

        // Copy assignments from original reminder to new instance
        const { data: assignments, error: assignmentsError } = await supabase
          .from('reminder_assignments')
          .select('*')
          .eq('reminder_id', reminder.id);

        if (assignmentsError) {
          console.error(`[RECURRING] Error fetching assignments for ${reminder.id}:`, assignmentsError);
        } else if (assignments && assignments.length > 0) {
          // Get the newly created reminder's ID
          const { data: newReminder, error: newReminderError } = await supabase
            .from('reminders')
            .select('id')
            .eq('parent_reminder_id', reminder.id)
            .eq('due_date', nextDate.toISOString())
            .single();

          if (newReminderError || !newReminder) {
            console.error(`[RECURRING] Error finding newly created reminder:`, newReminderError);
          } else {
            // Create assignments for the new reminder instance
            const newAssignments = assignments.map(assignment => ({
              reminder_id: newReminder.id,
              assignedto: assignment.assignedto,
              status: 'backlog' as const, // New instances start as backlog
            }));

            const { error: copyError } = await supabase
              .from('reminder_assignments')
              .insert(newAssignments);

            if (copyError) {
              console.error(`[RECURRING] Error copying assignments to new reminder:`, copyError);
            } else {
              console.log(`[RECURRING] Copied ${newAssignments.length} assignments to new reminder instance`);
            }
          }
        }

        processedCount++;
        console.log(`[RECURRING] ✅ Successfully processed reminder ${reminder.id}`);

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

/**
 * Calculate the next occurrence date using RRULE
 */
function calculateNextOccurrence(rruleString: string | null, currentDueDate: string): Date | null {
  if (!rruleString) {
    console.warn('[RECURRING] No RRULE provided');
    return null;
  }

  try {
    // Parse the RRULE string
    const rrule = rrulestr(rruleString);

    // Get the current due date
    const currentDate = new Date(currentDueDate);
    const now = new Date();

    // Find the next occurrence after the current due date
    const occurrences = rrule.between(currentDate, new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000), true);

    if (occurrences.length === 0) {
      console.warn('[RECURRING] No future occurrences found for RRULE:', rruleString);
      return null;
    }

    // Return the next occurrence (first one after current date)
    const nextOccurrence = occurrences[0];

    // Ensure it's in the future (not the current due date)
    if (nextOccurrence.getTime() <= currentDate.getTime()) {
      // If we only have the current date, get the next one
      if (occurrences.length > 1) {
        return occurrences[1];
      }

      // Try to manually calculate next occurrence for simple cases
      return calculateSimpleNextOccurrence(rruleString, currentDate);
    }

    return nextOccurrence;

  } catch (error) {
    console.error('[RECURRING] Error parsing RRULE:', rruleString, error);

    // Fallback to simple calculation for common patterns
    return calculateSimpleNextOccurrence(rruleString, new Date(currentDueDate));
  }
}

/**
 * Simple fallback calculation for common recurrence patterns
 */
function calculateSimpleNextOccurrence(rruleString: string, currentDate: Date): Date | null {
  const upperRrule = rruleString.toUpperCase();

  if (upperRrule.includes('FREQ=DAILY')) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    return nextDate;
  }

  if (upperRrule.includes('FREQ=WEEKLY')) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 7);
    return nextDate;
  }

  if (upperRrule.includes('FREQ=MONTHLY')) {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    return nextDate;
  }

  if (upperRrule.includes('FREQ=YEARLY')) {
    const nextDate = new Date(currentDate);
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    return nextDate;
  }

  console.warn('[RECURRING] Unsupported recurrence pattern:', rruleString);
  return null;
}