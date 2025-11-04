# Podcast Architecture Plan

## 4 Podcast Types (FINAL)

### 1. Pre-recorded (audio-only) ✅ DONE
- **Status when ready:** `ready`
- **Interface:** Audio player in PodcastPlayer
- **Data needed:** `audio_url`
- **Generation:** `/api/generate-podcast`

### 2. Live-interactive (discussion) ✅ DONE
- **Status when ready:** `ready`
- **Interface:** LiveInteractivePodcast (ElevenLabs audio-only)
- **Data needed:** `script` (JSON array)
- **Generation:** `webhook/generate-interactive-podcast`
- **Redirect:** Yes, to `/interactive` route

### 3. Live-tutor (Q&A with slides) 🚧 NEW
- **Status when ready:** `ready`
- **Interface:** LiveTutorSession component
- **Layout:** Split screen
  - **Left:** Real-time slides viewer (listens to Supabase Realtime)
  - **Right:** ElevenLabs audio interface + speaking indicator
- **Data needed:**
  - `script` (JSON array for ElevenLabs)
  - `slides` (array with metadata: `[{url, order, title, notes}]`)
- **Generation:** `https://maxipad.app.n8n.cloud/webhook/9bba5bd1-ffec-42fb-b47e-2bb937c421ef`
- **Redirect:** Yes, to `/tutor-session` route
- **Realtime:** Subscribe to `podcasts` table changes for `slides` column
- **ElevenLabs Tool:** "Change Slide" tool updates current slide via webhook

### 4. Static Video (YouTube-style) 🆕 NEW
- **Type:** `static-video`
- **Status when ready:** `ready`
- **Interface:** Video player in PodcastPlayer
- **Data needed:** `video_url`
- **Generation:** `https://maxipad.app.n8n.cloud/webhook/d5657317-09f9-4d0b-b14c-217275d6e97c`
- **Redirect:** No, stays on PodcastPlayer

---

## Database Schema Updates Needed

```sql
ALTER TABLE podcasts ADD COLUMN slides JSONB DEFAULT '[]';
ALTER TABLE podcasts ADD COLUMN video_url TEXT;
ALTER TABLE podcasts ADD COLUMN current_slide_number INTEGER DEFAULT 0;
```

**Columns:**
- `audio_url` - Pre-recorded audio file
- `video_url` - Static video file (for static-video)
- `script` - ElevenLabs conversation script (live-interactive, live-tutor)
- `slides` - Array with metadata for live-tutor: `[{url, order, title, notes}]`
- `current_slide_number` - Tracks which slide is currently displayed (updated by ElevenLabs tool)

---

## New Components to Create

### 1. `LiveTutorSession.jsx`
```javascript
// Route: /study-set/:setId/podcasts/:podcastId/tutor-session
// Layout: Grid 2 columns (50/50 split)
// Left: <SlideViewer slides={podcast.slides} currentSlide={podcast.current_slide_number} />
// Right: <ElevenLabsAudioInterface agentId={tutorAgentId} script={script} />
// Supabase Realtime: Subscribe to podcast.current_slide_number updates
```

### 2. `SlideViewer.jsx` (shared component)
```javascript
// Props:
//   slides = [{url, order, title, notes}]
//   currentSlide = number (index)
// Display: Current slide image + metadata (title, notes)
// Auto-update: When current_slide_number changes via Realtime
// Animations: Fade transition between slides
```

---

## PodcastPlayer.jsx Logic Update

```javascript
// When podcast.status === 'ready':
if (podcast.type === 'live-interactive') {
  navigate(`/study-set/${id}/podcasts/${podcastId}/interactive`)
}
else if (podcast.type === 'live-tutor') {
  navigate(`/study-set/${id}/podcasts/${podcastId}/tutor-session`)
}
else if (podcast.type === 'static-video' && podcast.video_url) {
  // Stay on PodcastPlayer, show video player
  <video src={podcast.video_url} controls className="w-full" />
}
else if (podcast.type === 'pre-recorded' && podcast.audio_url) {
  // Stay on PodcastPlayer, show audio player
  <audio src={podcast.audio_url} controls className="w-full" />
}
```

---

## Routes to Add in App.jsx

```javascript
// Live tutor with slides
<Route path="/study-set/:setId/podcasts/:podcastId/tutor-session"
  element={<ProtectedRoute><LiveTutorSession /></ProtectedRoute>} />
```

---

## ElevenLabs Agent Webhook Integration

### "Change Slide" Tool Flow:

1. **Agent has "Change Slide" tool** configured in ElevenLabs
   - Tool Name: "Change Slide Webhook"
   - Method: POST
   - URL: `https://maxipad.app.n8n.cloud/webhook/b580708f-48db-4e93-aa0e-f9cbb4880f75`

2. **Tool parameters:**
   - `slide_number_to_move_to` (Dynamic Variable) - Target slide number
   - `Current_Slide_Number` (Dynamic Variable) - Current slide for context

3. **n8n processes webhook:**
   - Receives slide number
   - Updates Supabase:
     ```sql
     UPDATE podcasts
     SET current_slide_number = X
     WHERE id = podcast_id
     ```

4. **Frontend receives Realtime update:**
   - Supabase subscription detects `current_slide_number` change
   - SlideViewer updates to show new slide with fade transition

5. **Slide metadata displayed:**
   - Image: `slides[current_slide_number].url`
   - Title: `slides[current_slide_number].title`
   - Notes: `slides[current_slide_number].notes`

---

## CreatePodcast.jsx Updates

Add buttons for new types:
```javascript
<div className="grid grid-cols-4 gap-3">
  <button type="button" onClick={() => updateField('type', 'pre-recorded')}>
    Pre-Recorded
    <div className="text-xs">Listen only</div>
  </button>
  <button type="button" onClick={() => updateField('type', 'live-interactive')}>
    Live Interactive
    <div className="text-xs">Discussion</div>
  </button>
  <button type="button" onClick={() => updateField('type', 'live-tutor')}>
    Live Tutor
    <div className="text-xs">Q&A + Slides</div>
  </button>
  <button type="button" onClick={() => updateField('type', 'static-video')}>
    Video
    <div className="text-xs">YouTube-style</div>
  </button>
</div>
```

Update webhook generation logic:
```javascript
// In handleSubmit, after navigate():
setTimeout(() => {
  if (formData.type === 'live-interactive') {
    startInteractiveGeneration(podcast).catch(...)
  } else if (formData.type === 'live-tutor') {
    startLiveTutorGeneration(podcast).catch(...)  // Existing
  } else if (formData.type === 'static-video') {
    startStaticVideoGeneration(podcast).catch(...)  // NEW
  } else {
    startPreRecordedGeneration(podcast).catch(...)
  }
}, 0)

// NEW function:
async function startStaticVideoGeneration(podcast) {
  const { data: flashcards } = await supabase
    .from('flashcards')
    .select('question, answer')
    .eq('study_set_id', id)
    .is('deleted_at', null)

  await fetch('https://maxipad.app.n8n.cloud/webhook/d5657317-09f9-4d0b-b14c-217275d6e97c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      podcast_id: podcast.id,
      title: podcast.title,
      user_goal: podcast.user_goal,
      duration_minutes: podcast.duration_minutes,
      flashcards: flashcards || []
    })
  })
}

// UPDATE existing function to use correct webhook:
async function startLiveTutorGeneration(podcast) {
  // Change webhook URL to:
  // https://maxipad.app.n8n.cloud/webhook/9bba5bd1-ffec-42fb-b47e-2bb937c421ef
}
```

---

## Implementation Order

1. ✅ Update PODCAST_ARCHITECTURE.md
2. 🔄 Update database schema (add video_url, slides, current_slide_number columns)
3. 🔄 Create SlideViewer component (with metadata: title, notes, fade transitions)
4. 🔄 Create LiveTutorSession component (split screen with ElevenLabs + Realtime)
5. 🔄 Update PodcastPlayer to show video player for static-video
6. 🔄 Update PodcastPlayer redirect logic for live-tutor
7. 🔄 Add tutor-session route in App.jsx
8. 🔄 Update CreatePodcast with 4 podcast types
9. 🔄 Update startLiveTutorGeneration webhook URL
10. 🔄 Add startStaticVideoGeneration function
11. 🔄 Test live-tutor with manual current_slide_number updates
12. ✅ Update CLAUDE.md with final architecture

---

## Supabase Realtime Subscription Example

```javascript
useEffect(() => {
  const channel = supabase
    .channel(`podcast-${podcastId}`)
    .on('postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'podcasts',
        filter: `id=eq.${podcastId}`
      },
      (payload) => {
        // Update current slide number when agent changes it
        if (payload.new.current_slide_number !== podcast.current_slide_number) {
          setPodcast(prev => ({
            ...prev,
            current_slide_number: payload.new.current_slide_number
          }))
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [podcastId])
```

---

## STARTING IMPLEMENTATION NOW
