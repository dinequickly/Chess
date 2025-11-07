# Study Planner - Your Questions Answered

## Question 1: What does the calendar expect in Supabase?

### Current Database Schema

The `calendar_events` table currently has these columns:

```sql
calendar_events
├── id (uuid)
├── user_id (uuid) → Links to auth.users
├── study_set_id (uuid) → Links to study_sets (optional)
├── event_type (text) → 'exam', 'study_session', 'quiz', etc.
├── title (text)
├── description (text)
├── scheduled_date (timestamptz) ⚠️ MISMATCH!
├── end_date (timestamptz) ⚠️ MISMATCH!
├── all_day (boolean)
├── completed (boolean)
└── ... other fields
```

### The Problem

**The Study Planner code expects:**
- `start_time` (not `scheduled_date`)
- `end_time` (not `end_date`)

### The Fix

I created a migration to rename the columns:

```bash
# Run this to apply the migration
supabase db reset
# OR push to remote
supabase db push
```

The migration (`20251107131222_rename_calendar_event_columns_to_start_end_time.sql`) will:
1. Rename `scheduled_date` → `start_time`
2. Rename `end_date` → `end_time`
3. Update indexes
4. Add helpful comments

### What the Study Planner Needs (After Migration)

**Minimum for testing:**

```sql
-- 1. Add an exam
INSERT INTO calendar_events (user_id, title, event_type, start_time, end_time)
VALUES (
  'YOUR_USER_ID',
  'Biology Midterm',
  'exam',
  NOW() + INTERVAL '5 days',
  NOW() + INTERVAL '5 days' + INTERVAL '2 hours'
);
```

**Optimal setup (with study set link):**

```sql
-- 1. Create study set first
INSERT INTO study_sets (id, user_id, title, subject_area, total_cards)
VALUES (
  gen_random_uuid(),
  'YOUR_USER_ID',
  'Biology Review',
  'Biology',
  15
);

-- 2. Create exam linked to study set
INSERT INTO calendar_events (
  user_id,
  study_set_id,
  title,
  event_type,
  start_time,
  end_time
)
VALUES (
  'YOUR_USER_ID',
  (SELECT id FROM study_sets WHERE title = 'Biology Review' AND user_id = 'YOUR_USER_ID'),
  'Biology Midterm',
  'exam',
  NOW() + INTERVAL '5 days',
  NOW() + INTERVAL '5 days' + INTERVAL '2 hours'
);
```

---

## Question 2: What do rows from Supabase give agents as context for what's going on with the course?

### Agent Context Flow

The Study Planner Agent builds its understanding through **3 database queries**:

#### Query 1: Fetch Upcoming Exams

```javascript
// From StudyPlannerAgent.jsx:48
const { data: exams } = await supabase
  .from('calendar_events')
  .select('*')
  .eq('user_id', user.id)
  .eq('event_type', 'exam')
  .gte('start_time', new Date().toISOString())
  .order('start_time', { ascending: true });
```

**Agent gets:**
```javascript
[
  {
    id: 'uuid-1',
    user_id: 'user-123',
    study_set_id: 'set-abc',
    title: 'Biology Midterm',
    description: 'Comprehensive exam on chapters 1-5',
    event_type: 'exam',
    start_time: '2025-11-12T14:00:00Z',
    end_time: '2025-11-12T16:00:00Z',
    all_day: false
  },
  {
    id: 'uuid-2',
    user_id: 'user-123',
    study_set_id: 'set-xyz',
    title: 'Chemistry Quiz',
    event_type: 'exam',
    start_time: '2025-11-15T10:00:00Z',
    end_time: '2025-11-15T11:00:00Z',
    all_day: false
  }
]
```

**What the agent learns:**
- ✅ What exams are coming up
- ✅ When they are (urgency calculation: `getDaysUntil()`)
- ✅ Which study sets they're linked to (if any)
- ✅ How much time the exam takes (duration)

#### Query 2: Fetch Study Sets

```javascript
// From StudyPlannerAgent.jsx:58
const { data: studySets } = await supabase
  .from('study_sets')
  .select('*')
  .eq('user_id', user.id);
```

**Agent gets:**
```javascript
[
  {
    id: 'set-abc',
    user_id: 'user-123',
    title: 'Biology Review',
    subject_area: 'Biology',
    description: 'Cell biology and genetics',
    total_cards: 15,
    color_theme: 'blue',
    created_at: '2025-11-01T10:00:00Z'
  },
  {
    id: 'set-xyz',
    user_id: 'user-123',
    title: 'Chemistry Fundamentals',
    subject_area: 'Chemistry',
    total_cards: 20,
    color_theme: 'green'
  }
]
```

**What the agent learns:**
- ✅ How many flashcards exist per subject (`total_cards`)
- ✅ What subjects the user is studying
- ✅ Which study sets to link to generated sessions

#### Query 3: Fetch Flashcard Progress (for Readiness Assessment)

```javascript
// From StudyPlannerAgent.jsx (inside calculateAssessments)
const { data: progress } = await supabase
  .from('flashcard_progress')
  .select('*')
  .eq('user_id', user.id)
  .in('flashcard_id', studySet.flashcard_ids);
```

**Agent gets:**
```javascript
[
  {
    id: 'prog-1',
    user_id: 'user-123',
    flashcard_id: 'card-1',
    times_seen: 5,
    times_correct: 4,
    mastery_level: 'reviewing',
    next_review_date: '2025-11-08T09:00:00Z'
  },
  {
    id: 'prog-2',
    user_id: 'user-123',
    flashcard_id: 'card-2',
    times_seen: 3,
    times_correct: 1,
    mastery_level: 'learning'
  }
]
```

**What the agent calculates:**
```javascript
// From studyAgent.js:245
const avgCorrectRate = cardsReviewed > 0
  ? totalMastery / cardsReviewed
  : 0;

const masteryPercent = Math.round(
  (cardsReviewed / totalCards) * avgCorrectRate * 100
);

// Result:
{
  masteryPercent: 65,     // 0-100% how ready they are
  cardsReviewed: 10,      // Cards they've practiced
  totalCards: 15,         // Total in study set
  avgCorrectRate: 75      // Average success rate
}
```

### Full Context Example

When the agent talks to the user, here's what it knows:

```javascript
agentState = {
  stage: 'ASSESS_READINESS',

  // From calendar_events query
  upcomingExams: [
    {
      id: 'uuid-1',
      title: 'Biology Midterm',
      start_time: '2025-11-12T14:00:00Z',  // 5 days away
      study_set_id: 'set-abc'
    }
  ],

  // From study_sets query
  studySets: [
    {
      id: 'set-abc',
      title: 'Biology Review',
      total_cards: 15
    }
  ],

  // Calculated from flashcard_progress query
  assessments: {
    'uuid-1': {
      masteryPercent: 65,   // 65% ready
      cardsReviewed: 10,    // Reviewed 10/15 cards
      totalCards: 15,
      avgCorrectRate: 75    // Getting 75% correct
    }
  }
}
```

### Agent's Message Generation

Based on this context, the agent says:

```
Here's your readiness assessment:

1. **Biology Midterm** (in 5 days)
   - 15 flashcards (65% mastery)
   - ⚠️ Making progress

How many hours per day can you dedicate to studying?
```

### Canvas Integration Context

If you sync from Canvas LMS, the agent gets even MORE context:

```sql
-- Canvas data that could inform the agent
SELECT
  ca.title,
  ca.due_at,
  ca.points_possible,
  ca.submission_types,
  cc.name AS course_name,
  cc.course_code
FROM canvas_assignments ca
JOIN canvas_courses cc ON ca.course_id = cc.id
WHERE ca.due_at > NOW()
ORDER BY ca.due_at;
```

This Canvas data gets transformed into `calendar_events`:

```javascript
// Canvas assignment → calendar event
{
  title: 'Chapter 5 Quiz',           // From ca.title
  event_type: 'quiz',                // From ca.submission_types
  start_time: '2025-11-10T23:59:00Z', // From ca.due_at
  canvas_event_id: '12345',          // Link back to Canvas
  description: 'Worth 50 points'     // From ca.points_possible
}
```

### What Context is MISSING (and could be added)

Currently the agent does NOT have access to:

❌ Past learning session data (`learning_sessions` table)
❌ Time of day when user studies best
❌ User's actual availability/calendar blocks
❌ Study method preferences (Pomodoro, etc.)
❌ Course syllabi or lecture notes
❌ Group study preferences

These could be added in future enhancements!

---

## Summary

### Calendar Expects:
```javascript
{
  user_id: UUID,
  study_set_id: UUID (optional),
  title: string,
  event_type: 'exam' | 'study_session' | 'quiz' | etc.,
  start_time: timestamp,  // After migration
  end_time: timestamp,    // After migration
  all_day: boolean
}
```

### Agent Gets as Context:
1. **Exams**: What's coming up, when, and how long
2. **Study Sets**: What subjects exist, how many cards
3. **Progress**: How prepared the user is (mastery %)

### Agent Generates:
```javascript
{
  title: 'Study: Biology Midterm',
  event_type: 'study_session',
  start_time: '2025-11-08T09:00:00Z',
  end_time: '2025-11-08T11:00:00Z',
  study_set_id: 'set-abc',
  user_id: 'user-123'
}
```

---

**Action Items:**
1. ✅ Run migration: `supabase db reset` or `supabase db push`
2. ✅ Add test exams using SQL from Quick Start guide
3. ✅ Test the conversation flow at `/study-planner`
