-- Add columns for video podcasts and live tutor slides
ALTER TABLE public.podcasts
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS slides JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS current_slide_number INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN public.podcasts.video_url IS 'URL to video file for static-video type podcasts';
COMMENT ON COLUMN public.podcasts.slides IS 'Array of slide objects with metadata: [{url, order, title, notes}]';
COMMENT ON COLUMN public.podcasts.current_slide_number IS 'Current slide index for live-tutor sessions (updated by ElevenLabs agent)';
