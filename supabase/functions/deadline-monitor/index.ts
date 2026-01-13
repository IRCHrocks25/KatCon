import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("Deadline Monitor Edge Function Started")

serve(async (req) => {
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date()
    console.log(`[DEADLINE MONITOR] Starting deadline check at ${now.toISOString()}`)

    // Check for approaching deadlines (next 24 hours)
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: approachingDeadlines, error: approachingError } = await supabase
      .from('reminders')
      .select(`
        id,
        title,
        due_date,
        priority,
        user_id,
        reminder_assignments!inner(assignedto)
      `)
      .eq('reminder_assignments.status', 'in_progress') // Only active assignments
      .gte('due_date', now.toISOString()) // Not already past due
      .lte('due_date', twentyFourHoursFromNow.toISOString()) // Due within 24 hours
      .neq('status', 'done')
      .neq('status', 'hidden')

    if (approachingError) {
      console.error('[DEADLINE MONITOR] Error fetching approaching deadlines:', approachingError)
    } else {
      console.log(`[DEADLINE MONITOR] Found ${approachingDeadlines?.length || 0} approaching deadlines`)
    }

    // Check for overdue deadlines
    const { data: overdueDeadlines, error: overdueError } = await supabase
      .from('reminders')
      .select(`
        id,
        title,
        due_date,
        priority,
        user_id,
        reminder_assignments!inner(assignedto)
      `)
      .eq('reminder_assignments.status', 'in_progress') // Only active assignments
      .lt('due_date', now.toISOString()) // Past due
      .neq('status', 'done')
      .neq('status', 'hidden')

    if (overdueError) {
      console.error('[DEADLINE MONITOR] Error fetching overdue deadlines:', overdueError)
    } else {
      console.log(`[DEADLINE MONITOR] Found ${overdueDeadlines?.length || 0} overdue deadlines`)
    }

    const allUrgentTasks = [
      ...(approachingDeadlines || []).map(task => ({ ...task, urgency: 'approaching' as const })),
      ...(overdueDeadlines || []).map(task => ({ ...task, urgency: 'overdue' as const }))
    ]

    let notificationsSent = 0
    const processedTasks = new Set<string>()

    // Send notifications for each urgent task
    for (const task of allUrgentTasks) {
      // Avoid duplicate notifications for the same task
      if (processedTasks.has(task.id)) continue
      processedTasks.add(task.id)

      // Get all assignees for this task
      const assignees = task.reminder_assignments?.map((ra: any) => ra.assignedto) || []

      for (const assigneeEmail of assignees) {
        try {
          // Check if we've already sent a notification for this task recently (within last hour)
          const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

          const { data: existingNotification } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_email', assigneeEmail)
            .eq('reminder_id', task.id)
            .eq('type', task.urgency === 'overdue' ? 'deadline_overdue' : 'deadline_approaching')
            .gte('created_at', oneHourAgo.toISOString())
            .single()

          // Skip if notification already exists
          if (existingNotification) {
            console.log(`[DEADLINE MONITOR] Skipping duplicate notification for ${assigneeEmail} on task ${task.id}`)
            continue
          }

          // Create notification
          const notificationData = {
            user_email: assigneeEmail,
            type: task.urgency === 'overdue' ? 'deadline_overdue' : 'deadline_approaching',
            title: task.urgency === 'overdue' ? 'Task Overdue!' : 'Deadline Approaching',
            message: `"${task.title}" is ${task.urgency === 'overdue' ? 'overdue' : 'due soon'}`,
            reminder_id: task.id,
            priority: task.priority,
            metadata: {
              task_id: task.id,
              due_date: task.due_date,
              urgency: task.urgency,
              hours_remaining: task.urgency === 'overdue' ? 0 :
                Math.max(0, Math.floor((new Date(task.due_date).getTime() - now.getTime()) / (1000 * 60 * 60)))
            }
          }

          const { error: notificationError } = await supabase
            .from('notifications')
            .insert(notificationData)

          if (notificationError) {
            console.error(`[DEADLINE MONITOR] Error creating notification for ${assigneeEmail}:`, notificationError)
          } else {
            notificationsSent++
            console.log(`[DEADLINE MONITOR] ✅ Sent ${task.urgency} notification to ${assigneeEmail} for "${task.title}"`)
          }

        } catch (error) {
          console.error(`[DEADLINE MONITOR] Error processing notification for ${assigneeEmail}:`, error)
        }
      }
    }

    // Log summary
    console.log(`[DEADLINE MONITOR] Processing complete:`)
    console.log(`  - Approaching deadlines: ${approachingDeadlines?.length || 0}`)
    console.log(`  - Overdue deadlines: ${overdueDeadlines?.length || 0}`)
    console.log(`  - Notifications sent: ${notificationsSent}`)

    return new Response(JSON.stringify({
      success: true,
      approaching: approachingDeadlines?.length || 0,
      overdue: overdueDeadlines?.length || 0,
      notifications_sent: notificationsSent,
      timestamp: now.toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[DEADLINE MONITOR] Unexpected error:', error)

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})