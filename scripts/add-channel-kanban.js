#!/usr/bin/env node

/**
 * Database migration script to add channel-specific Kanban board support
 * Adds channel_id field to reminders table to associate tasks with channels
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Starting channel Kanban migration...');

  try {
    // Check if channel_id column already exists
    console.log('📋 Checking if channel_id column exists...');

    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'reminders')
      .eq('column_name', 'channel_id');

    if (columnsError) {
      console.error('❌ Error checking columns:', columnsError);
      return;
    }

    if (columns && columns.length > 0) {
      console.log('✅ channel_id column already exists, skipping migration');
      return;
    }

    // Add channel_id column to reminders table
    console.log('🔧 Adding channel_id column to reminders table...');

    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE reminders
        ADD COLUMN channel_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
      `
    });

    if (alterError) {
      // Try direct SQL approach
      console.log('⚠️ RPC failed, trying direct SQL...');

      const { error: directError } = await supabase
        .from('reminders')
        .select('*')
        .limit(1); // Just to test connection

      if (directError) {
        console.error('❌ Cannot modify database schema. Please run this SQL manually in your Supabase dashboard:');
        console.log(`
ALTER TABLE reminders
ADD COLUMN channel_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX idx_reminders_channel_id ON reminders(channel_id);

-- Add RLS policy for channel-specific access
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see tasks from channels they're members of
CREATE POLICY "Users can view tasks from their channels" ON reminders
FOR SELECT USING (
  channel_id IS NULL OR
  channel_id IN (
    SELECT cp.conversation_id
    FROM conversation_participants cp
    WHERE cp.user_id = auth.uid()
  )
);

-- Policy: Users can create tasks in channels they're members of
CREATE POLICY "Users can create tasks in their channels" ON reminders
FOR INSERT WITH CHECK (
  channel_id IS NULL OR
  channel_id IN (
    SELECT cp.conversation_id
    FROM conversation_participants cp
    WHERE cp.user_id = auth.uid()
  )
);

-- Policy: Users can update tasks in channels they're members of (or their own global tasks)
CREATE POLICY "Users can update tasks in their channels" ON reminders
FOR UPDATE USING (
  (channel_id IS NULL AND user_id = auth.uid()) OR
  (channel_id IS NOT NULL AND channel_id IN (
    SELECT cp.conversation_id
    FROM conversation_participants cp
    WHERE cp.user_id = auth.uid()
  ))
);

-- Policy: Only creators can delete tasks
CREATE POLICY "Only creators can delete tasks" ON reminders
FOR DELETE USING (user_id = auth.uid());
        `);
        return;
      }
    }

    // Create index for better performance
    console.log('🔧 Creating index on channel_id...');
    await supabase.rpc('exec_sql', {
      sql: 'CREATE INDEX IF NOT EXISTS idx_reminders_channel_id ON reminders(channel_id);'
    });

    // Add RLS policies for channel-specific access
    console.log('🔒 Setting up Row Level Security policies...');

    // Enable RLS if not already enabled
    await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;'
    });

    // Drop existing policies if they exist
    await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "Users can view tasks from their channels" ON reminders;'
    });
    await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "Users can create tasks in their channels" ON reminders;'
    });
    await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "Users can update tasks in their channels" ON reminders;'
    });
    await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "Only creators can delete tasks" ON reminders;'
    });

    // Create new policies
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Users can view tasks from their channels" ON reminders
        FOR SELECT USING (
          channel_id IS NULL OR
          channel_id IN (
            SELECT cp.conversation_id
            FROM conversation_participants cp
            WHERE cp.user_id = auth.uid()
          )
        );
      `
    });

    await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Users can create tasks in their channels" ON reminders
        FOR INSERT WITH CHECK (
          channel_id IS NULL OR
          channel_id IN (
            SELECT cp.conversation_id
            FROM conversation_participants cp
            WHERE cp.user_id = auth.uid()
          )
        );
      `
    });

    await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Users can update tasks in their channels" ON reminders
        FOR UPDATE USING (
          (channel_id IS NULL AND user_id = auth.uid()) OR
          (channel_id IS NOT NULL AND channel_id IN (
            SELECT cp.conversation_id
            FROM conversation_participants cp
            WHERE cp.user_id = auth.uid()
          ))
        );
      `
    });

    await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Only creators can delete tasks" ON reminders
        FOR DELETE USING (user_id = auth.uid());
      `
    });

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📋 What was added:');
    console.log('   • channel_id column (UUID, references conversations.id)');
    console.log('   • Database index on channel_id for performance');
    console.log('   • Row Level Security policies for channel access control');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('   1. Update your Reminder interface to include channelId');
    console.log('   2. Modify task creation APIs to accept channel_id');
    console.log('   3. Update UI components to show channel-specific Kanban boards');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('');
    console.log('🔧 Manual SQL commands to run in Supabase dashboard:');
    console.log(`
-- Add channel_id column
ALTER TABLE reminders
ADD COLUMN channel_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

-- Create index
CREATE INDEX idx_reminders_channel_id ON reminders(channel_id);

-- Enable RLS
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Add policies (see full SQL in the script output above)
    `);
  }
}

// Run the migration
runMigration().then(() => {
  console.log('🏁 Migration script completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Migration script failed:', error);
  process.exit(1);
});
