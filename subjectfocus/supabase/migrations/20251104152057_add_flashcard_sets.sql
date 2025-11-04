-- Create flashcard_sets table
CREATE TABLE IF NOT EXISTS public.flashcard_sets (
  id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
  study_set_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  card_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT flashcard_sets_study_set_id_fkey
    FOREIGN KEY (study_set_id)
    REFERENCES public.study_sets(id)
    ON DELETE CASCADE,
  CONSTRAINT flashcard_sets_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- Ensure only one default set per study_set
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_per_study_set 
  ON public.flashcard_sets(study_set_id) 
  WHERE is_default = true;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_flashcard_sets_study_set_id 
  ON public.flashcard_sets(study_set_id);

CREATE INDEX IF NOT EXISTS idx_flashcard_sets_user_id 
  ON public.flashcard_sets(user_id);

-- Add flashcard_set_id to flashcards table (nullable for now)
ALTER TABLE public.flashcards 
ADD COLUMN IF NOT EXISTS flashcard_set_id uuid;

-- Add foreign key constraint
ALTER TABLE public.flashcards
ADD CONSTRAINT flashcard_set_id_fkey
  FOREIGN KEY (flashcard_set_id)
  REFERENCES public.flashcard_sets(id)
  ON DELETE CASCADE;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_flashcards_flashcard_set_id 
  ON public.flashcards(flashcard_set_id);

-- Function: Create default flashcard set for each study set
CREATE OR REPLACE FUNCTION create_default_flashcard_sets()
RETURNS void AS $$
BEGIN
  -- Create default flashcard set for each study set that doesn't have one
  INSERT INTO public.flashcard_sets (study_set_id, user_id, title, is_default, card_count)
  SELECT 
    ss.id,
    ss.user_id,
    ss.title || ' - Main Cards',
    true,
    ss.total_cards
  FROM public.study_sets ss
  WHERE NOT EXISTS (
    SELECT 1 FROM public.flashcard_sets fs 
    WHERE fs.study_set_id = ss.id AND fs.is_default = true
  );
  
  -- Link all existing flashcards to their default sets
  UPDATE public.flashcards f
  SET flashcard_set_id = (
    SELECT fs.id 
    FROM public.flashcard_sets fs 
    WHERE fs.study_set_id = f.study_set_id 
      AND fs.is_default = true
  )
  WHERE f.flashcard_set_id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT create_default_flashcard_sets();

-- Now make flashcard_set_id NOT NULL
ALTER TABLE public.flashcards 
ALTER COLUMN flashcard_set_id SET NOT NULL;

-- Trigger: Update flashcard_set card_count
CREATE OR REPLACE FUNCTION update_flashcard_set_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    UPDATE public.flashcard_sets 
    SET card_count = card_count + 1,
        updated_at = NOW()
    WHERE id = NEW.flashcard_set_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle soft delete
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.flashcard_sets 
      SET card_count = card_count - 1,
          updated_at = NOW()
      WHERE id = NEW.flashcard_set_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.flashcard_sets 
      SET card_count = card_count + 1,
          updated_at = NOW()
      WHERE id = NEW.flashcard_set_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.flashcard_sets 
    SET card_count = card_count - 1,
        updated_at = NOW()
    WHERE id = OLD.flashcard_set_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_flashcard_set_count ON public.flashcards;
CREATE TRIGGER trigger_update_flashcard_set_count
AFTER INSERT OR UPDATE OR DELETE ON public.flashcards
FOR EACH ROW EXECUTE FUNCTION update_flashcard_set_count();

-- RLS Policies
ALTER TABLE public.flashcard_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own flashcard sets"
  ON public.flashcard_sets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create flashcard sets"
  ON public.flashcard_sets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own flashcard sets"
  ON public.flashcard_sets FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own non-default flashcard sets"
  ON public.flashcard_sets FOR DELETE
  USING (user_id = auth.uid() AND is_default = false);

-- Comments
COMMENT ON TABLE public.flashcard_sets IS 'Organizes flashcards into sets within a study set';
COMMENT ON COLUMN public.flashcard_sets.is_default IS 'Default set created automatically, cannot be deleted';
COMMENT ON COLUMN public.flashcard_sets.card_count IS 'Auto-maintained count of non-deleted flashcards';
