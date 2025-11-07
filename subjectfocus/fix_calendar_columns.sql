-- Fix calendar_events columns to match Study Planner code
-- Run this directly in Supabase SQL Editor

-- Check current column names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events'
    AND column_name = 'scheduled_date'
  ) THEN
    -- Rename scheduled_date to start_time
    ALTER TABLE calendar_events RENAME COLUMN scheduled_date TO start_time;
    RAISE NOTICE 'Renamed scheduled_date to start_time';
  ELSE
    RAISE NOTICE 'Column scheduled_date does not exist (already renamed?)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_events'
    AND column_name = 'end_date'
  ) THEN
    -- Rename end_date to end_time
    ALTER TABLE calendar_events RENAME COLUMN end_date TO end_time;
    RAISE NOTICE 'Renamed end_date to end_time';
  ELSE
    RAISE NOTICE 'Column end_date does not exist (already renamed?)';
  END IF;
END $$;

-- Recreate indexes with new column names
DROP INDEX IF EXISTS idx_calendar_events_upcoming;
DROP INDEX IF EXISTS idx_calendar_events_user;

CREATE INDEX IF NOT EXISTS idx_calendar_events_upcoming
  ON calendar_events (user_id, start_time)
  WHERE completed = false;

CREATE INDEX IF NOT EXISTS idx_calendar_events_user
  ON calendar_events (user_id, start_time);

-- Add comments
COMMENT ON COLUMN calendar_events.start_time IS 'Event start date and time (renamed from scheduled_date for consistency)';
COMMENT ON COLUMN calendar_events.end_time IS 'Event end date and time (renamed from end_date for consistency)';

-- Verify the change
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'calendar_events'
AND column_name IN ('start_time', 'end_time', 'scheduled_date', 'end_date')
ORDER BY column_name;
