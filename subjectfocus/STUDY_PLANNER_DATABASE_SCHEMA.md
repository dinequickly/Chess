# Study Planner - Database Schema Reference

## Calendar Events Table Schema

The `calendar_events` table uses these column names:

```sql
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  study_set_id UUID REFERENCES study_sets(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN ('test', 'exam', 'quiz', 'study_session', 'reminder', 'assignment_due', 'review_session')),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,

  -- Timing (IMPORTANT: These are the actual column names!)
  scheduled_date TIMESTAMPTZ NOT NULL,  -- NOT "start_time"
  end_date TIMESTAMPTZ,                 -- NOT "end_time"
  all_day BOOLEAN DEFAULT false,
  timezone TEXT DEFAULT 'UTC',

  -- Metadata
  reminder_minutes_before INTEGER[],
  canvas_event_id TEXT,
  google_calendar_id TEXT,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Field Mapping Issue

The Study Planner code currently uses:
- `start_time` → Should be `scheduled_date`
- `end_time` → Should be `end_date`

## Two Options to Fix

### Option 1: Update the Code (Recommended)

Change all references in the Study Planner code from `start_time`/`end_time` to `scheduled_date`/`end_date`.

Files to update:
1. `src/lib/studyAgent.js` - 10 occurrences
2. `src/lib/calendarUtils.js` - 3 occurrences
3. `src/components/StudyPlannerAgent.jsx` - 3 occurrences
4. `src/pages/StudyPlanner.jsx` - 5 occurrences
5. `src/components/CalendarView.jsx` - Usage via events passed as props

### Option 2: Add Database View/Migration (Alternative)

Create a view or add columns for backwards compatibility:

```sql
-- Option A: Create a view
CREATE VIEW calendar_events_compat AS
SELECT
  *,
  scheduled_date AS start_time,
  end_date AS end_time
FROM calendar_events;

-- Option B: Add actual columns (if you want both naming conventions)
ALTER TABLE calendar_events
  ADD COLUMN start_time TIMESTAMPTZ GENERATED ALWAYS AS (scheduled_date) STORED,
  ADD COLUMN end_time TIMESTAMPTZ GENERATED ALWAYS AS (end_date) STORED;
```

## What the Study Planner Agent Expects

### Input Data Structure (Exams from Database)

```javascript
{
  id: 'uuid',
  user_id: 'uuid',
  study_set_id: 'uuid',  // Links to study_sets table
  title: 'Biology Midterm',
  description: 'Comprehensive exam on chapters 1-5',
  event_type: 'exam',
  scheduled_date: '2025-11-12T14:00:00Z',  // Currently called start_time in code
  end_date: '2025-11-12T16:00:00Z',        // Currently called end_time in code
  all_day: false,
  created_at: '2025-11-07T10:00:00Z',
  updated_at: '2025-11-07T10:00:00Z'
}
```

### Agent Conversation Context

When the agent assesses readiness, it queries:

1. **Calendar Events** (exams):
   ```sql
   SELECT * FROM calendar_events
   WHERE user_id = $1
     AND event_type = 'exam'
     AND scheduled_date >= NOW()
   ORDER BY scheduled_date ASC;
   ```

2. **Study Sets** (for each exam):
   ```sql
   SELECT * FROM study_sets
   WHERE id = $1;  -- From exam.study_set_id
   ```

3. **Flashcard Progress** (for readiness calculation):
   ```sql
   SELECT * FROM flashcard_progress
   WHERE user_id = $1
     AND flashcard_id IN (
       SELECT id FROM flashcards WHERE study_set_id = $2
     );
   ```

### Output Data Structure (Generated Study Sessions)

The agent generates sessions and inserts them:

```javascript
{
  user_id: 'uuid',
  study_set_id: 'uuid',
  title: 'Study: Biology Midterm',
  description: 'Study session for Cell Biology',
  event_type: 'study_session',
  scheduled_date: '2025-11-08T09:00:00Z',  // Currently called start_time in code
  end_date: '2025-11-08T11:00:00Z',        // Currently called end_time in code
  all_day: false
}
```

## Required Data for Agent to Work

### Minimum Requirements

1. **User must have at least one exam**:
   ```sql
   INSERT INTO calendar_events (user_id, title, event_type, scheduled_date, end_date)
   VALUES ($1, 'Test Exam', 'exam', NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days' + INTERVAL '2 hours');
   ```

2. **Exam should link to a study set** (optional but recommended):
   ```sql
   UPDATE calendar_events
   SET study_set_id = $1  -- Your study set UUID
   WHERE id = $2;  -- Exam UUID
   ```

### Optimal Setup

For best results, the agent needs:

1. ✅ Exam events with `event_type = 'exam'`
2. ✅ Study sets linked via `study_set_id`
3. ✅ Flashcards in those study sets
4. ✅ (Optional) Progress data from previous practice sessions

## Canvas Integration Context

If you're syncing from Canvas LMS, the agent can leverage:

```sql
-- Canvas assignments that become exams
SELECT
  ca.title,
  ca.due_at AS scheduled_date,
  cc.name AS course_name,
  ca.points_possible
FROM canvas_assignments ca
JOIN canvas_courses cc ON ca.course_id = cc.id
WHERE ca.submission_types LIKE '%online_quiz%'
  OR ca.submission_types LIKE '%online_exam%';
```

The Canvas sync should:
1. Create `calendar_events` with `event_type = 'exam'`
2. Link to study sets if a matching set exists
3. Store Canvas metadata in `canvas_event_id`

## Example: Complete Setup for Testing

```sql
-- 1. Create a study set
INSERT INTO study_sets (id, user_id, title, subject_area, description, total_cards)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'YOUR_USER_ID',
  'Biology Exam Prep',
  'Biology',
  'Cell biology and genetics',
  15
);

-- 2. Create flashcards
INSERT INTO flashcards (study_set_id, question, answer, difficulty_level)
VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'What is mitosis?', 'Cell division process', 'easy'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'What are the phases?', 'PMAT', 'medium');

-- 3. Create an exam event (NOTE: Use scheduled_date, not start_time!)
INSERT INTO calendar_events (user_id, study_set_id, title, event_type, scheduled_date, end_date)
VALUES (
  'YOUR_USER_ID',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Biology Midterm',
  'exam',
  NOW() + INTERVAL '5 days',
  NOW() + INTERVAL '5 days' + INTERVAL '2 hours'
);

-- 4. (Optional) Add some progress data
INSERT INTO flashcard_progress (user_id, flashcard_id, times_seen, times_correct, mastery_level)
SELECT
  'YOUR_USER_ID',
  id,
  3,
  2,
  'learning'
FROM flashcards
WHERE study_set_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
LIMIT 5;
```

## Verification Queries

Check if setup is correct:

```sql
-- 1. Check exams
SELECT
  id,
  title,
  event_type,
  scheduled_date,
  end_date,
  study_set_id
FROM calendar_events
WHERE user_id = 'YOUR_USER_ID'
  AND event_type = 'exam'
  AND scheduled_date > NOW()
ORDER BY scheduled_date;

-- 2. Check study sets
SELECT
  id,
  title,
  subject_area,
  total_cards
FROM study_sets
WHERE user_id = 'YOUR_USER_ID';

-- 3. Check if exams are linked to study sets
SELECT
  ce.title AS exam_title,
  ce.scheduled_date AS exam_date,
  ss.title AS study_set_title,
  ss.total_cards
FROM calendar_events ce
LEFT JOIN study_sets ss ON ce.study_set_id = ss.id
WHERE ce.user_id = 'YOUR_USER_ID'
  AND ce.event_type = 'exam'
  AND ce.scheduled_date > NOW();
```

## Quick Fix SQL

If you want to quickly rename columns in your database to match the code:

```sql
-- WARNING: This will affect ALL queries in your app that use calendar_events!
-- Only run this if you want to standardize on start_time/end_time everywhere

ALTER TABLE calendar_events
  RENAME COLUMN scheduled_date TO start_time;

ALTER TABLE calendar_events
  RENAME COLUMN end_date TO end_time;

-- Update constraints
ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_event_type_check
  CHECK (event_type IN ('test', 'exam', 'quiz', 'study_session', 'reminder', 'assignment_due', 'review_session'));

-- Update indexes
DROP INDEX IF EXISTS idx_calendar_events_upcoming;
DROP INDEX IF EXISTS idx_calendar_events_user;

CREATE INDEX idx_calendar_events_upcoming
  ON calendar_events (user_id, start_time)
  WHERE completed = false;

CREATE INDEX idx_calendar_events_user
  ON calendar_events (user_id, start_time);
```

---

**Recommendation**: I'll create a migration to standardize on `start_time`/`end_time` since that's more intuitive and commonly used.
