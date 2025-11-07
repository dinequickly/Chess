-- Migration: Rename calendar_events columns for consistency
-- scheduled_date → start_time
-- end_date → end_time
-- This aligns the database schema with common naming conventions and the Study Planner code

-- Step 1: Rename columns
ALTER TABLE calendar_events
  RENAME COLUMN scheduled_date TO start_time;

ALTER TABLE calendar_events
  RENAME COLUMN end_date TO end_time;

-- Step 2: Recreate indexes with new column names
DROP INDEX IF EXISTS idx_calendar_events_upcoming;
DROP INDEX IF EXISTS idx_calendar_events_user;

CREATE INDEX idx_calendar_events_upcoming
  ON calendar_events (user_id, start_time)
  WHERE completed = false;

CREATE INDEX idx_calendar_events_user
  ON calendar_events (user_id, start_time);

-- Step 3: Add helpful comment
COMMENT ON COLUMN calendar_events.start_time IS 'Event start date and time (was scheduled_date)';
COMMENT ON COLUMN calendar_events.end_time IS 'Event end date and time (was end_date)';

-- Note: Supabase automatically updates RLS policies and foreign keys to use new column names
