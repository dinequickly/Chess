


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."update_study_set_card_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE study_sets 
        SET total_cards = total_cards + 1 
        WHERE id = NEW.study_set_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE study_sets 
        SET total_cards = GREATEST(total_cards - 1, 0)
        WHERE id = OLD.study_set_id;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_study_set_card_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "study_set_id" "uuid",
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "scheduled_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone,
    "all_day" boolean DEFAULT false,
    "timezone" "text" DEFAULT 'UTC'::"text",
    "reminder_minutes_before" integer[],
    "canvas_event_id" "text",
    "google_calendar_id" "text",
    "completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "calendar_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['test'::"text", 'exam'::"text", 'quiz'::"text", 'study_session'::"text", 'reminder'::"text", 'assignment_due'::"text", 'review_session'::"text"])))
);


ALTER TABLE "public"."calendar_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_courses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "canvas_integration_id" "uuid",
    "canvas_course_id" "text" NOT NULL,
    "study_set_id" "uuid",
    "course_name" "text" NOT NULL,
    "course_code" "text",
    "term" "text",
    "auto_create_study_sets" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."canvas_courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."canvas_integrations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "canvas_domain" "text" NOT NULL,
    "canvas_api_token_encrypted" "text" NOT NULL,
    "auto_sync_enabled" boolean DEFAULT true,
    "sync_assignments" boolean DEFAULT true,
    "sync_grades" boolean DEFAULT true,
    "sync_calendar" boolean DEFAULT true,
    "last_synced_at" timestamp with time zone,
    "sync_status" "text" DEFAULT 'active'::"text",
    "sync_error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "canvas_integrations_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."canvas_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flashcard_progress" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "flashcard_id" "uuid" NOT NULL,
    "study_set_id" "uuid" NOT NULL,
    "ease_factor" numeric(3,2) DEFAULT 2.5,
    "interval_days" integer DEFAULT 0,
    "repetitions" integer DEFAULT 0,
    "next_review_date" timestamp with time zone,
    "times_seen" integer DEFAULT 0,
    "times_correct" integer DEFAULT 0,
    "times_incorrect" integer DEFAULT 0,
    "last_reviewed_at" timestamp with time zone,
    "mastery_level" "text" DEFAULT 'new'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "flashcard_progress_mastery_level_check" CHECK (("mastery_level" = ANY (ARRAY['new'::"text", 'learning'::"text", 'reviewing'::"text", 'mastered'::"text"])))
);


ALTER TABLE "public"."flashcard_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flashcards" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "study_set_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "hint" "text",
    "explanation" "text",
    "difficulty_level" integer DEFAULT 1,
    "starred" boolean DEFAULT false,
    "card_order" integer,
    "source_page_url" "text",
    "source_metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "flashcards_difficulty_level_check" CHECK ((("difficulty_level" >= 1) AND ("difficulty_level" <= 5)))
);


ALTER TABLE "public"."flashcards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_sets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "subject_area" "text",
    "cover_image_url" "text",
    "color_theme" "text" DEFAULT '#6366f1'::"text",
    "is_public" boolean DEFAULT false,
    "canvas_course_id" "text",
    "learning_goals" "jsonb" DEFAULT '[]'::"jsonb",
    "total_cards" integer DEFAULT 0,
    "total_study_time" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."study_sets" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cards_due_for_review" AS
 SELECT "fp"."id",
    "fp"."user_id",
    "fp"."flashcard_id",
    "fp"."study_set_id",
    "fp"."ease_factor",
    "fp"."interval_days",
    "fp"."repetitions",
    "fp"."next_review_date",
    "fp"."times_seen",
    "fp"."times_correct",
    "fp"."times_incorrect",
    "fp"."last_reviewed_at",
    "fp"."mastery_level",
    "fp"."created_at",
    "fp"."updated_at",
    "f"."question",
    "f"."answer",
    "f"."starred",
    "ss"."title" AS "study_set_title"
   FROM (("public"."flashcard_progress" "fp"
     JOIN "public"."flashcards" "f" ON (("f"."id" = "fp"."flashcard_id")))
     JOIN "public"."study_sets" "ss" ON (("ss"."id" = "fp"."study_set_id")))
  WHERE (("fp"."next_review_date" <= "now"()) AND ("f"."deleted_at" IS NULL) AND ("ss"."deleted_at" IS NULL))
  ORDER BY "fp"."next_review_date";


ALTER VIEW "public"."cards_due_for_review" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_content" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "study_set_id" "uuid" NOT NULL,
    "content_type" "text" NOT NULL,
    "title" "text",
    "content_text" "text",
    "content_url" "text",
    "content_metadata" "jsonb",
    "generation_prompt" "text",
    "generation_params" "jsonb",
    "generation_model" "text" DEFAULT 'claude-sonnet-4'::"text",
    "generation_cost" numeric(10,4),
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "generated_content_content_type_check" CHECK (("content_type" = ANY (ARRAY['podcast'::"text", 'video'::"text", 'newsletter'::"text", 'study_guide'::"text", 'practice_test'::"text", 'brief'::"text", 'mindmap'::"text", 'quiz'::"text", 'flashcard_set'::"text"]))),
    CONSTRAINT "generated_content_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'generating'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."generated_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."learning_sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "study_set_id" "uuid" NOT NULL,
    "session_type" "text" NOT NULL,
    "duration_seconds" integer,
    "cards_reviewed" integer DEFAULT 0,
    "cards_correct" integer DEFAULT 0,
    "cards_incorrect" integer DEFAULT 0,
    "completion_percentage" integer,
    "session_data" "jsonb",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "learning_sessions_completion_percentage_check" CHECK ((("completion_percentage" >= 0) AND ("completion_percentage" <= 100))),
    CONSTRAINT "learning_sessions_session_type_check" CHECK (("session_type" = ANY (ARRAY['flashcards'::"text", 'quiz'::"text", 'practice_test'::"text", 'reading'::"text", 'podcast'::"text", 'video'::"text", 'mindmap'::"text", 'study_guide'::"text"])))
);


ALTER TABLE "public"."learning_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_set_collaborators" (
    "study_set_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text",
    "invited_at" timestamp with time zone DEFAULT "now"(),
    "joined_at" timestamp with time zone,
    CONSTRAINT "study_set_collaborators_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."study_set_collaborators" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."study_set_overview" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"uuid" AS "user_id",
    NULL::"text" AS "title",
    NULL::"text" AS "description",
    NULL::"text" AS "subject_area",
    NULL::"text" AS "cover_image_url",
    NULL::"text" AS "color_theme",
    NULL::integer AS "total_cards",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "mastered_cards",
    NULL::bigint AS "total_sessions",
    NULL::bigint AS "total_study_time_seconds",
    NULL::double precision AS "average_accuracy";


ALTER VIEW "public"."study_set_overview" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_set_tags" (
    "study_set_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."study_set_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_analytics" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "total_study_time_minutes" integer DEFAULT 0,
    "cards_reviewed" integer DEFAULT 0,
    "cards_mastered" integer DEFAULT 0,
    "sessions_completed" integer DEFAULT 0,
    "study_sets_accessed" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "learning_goals" "jsonb" DEFAULT '[]'::"jsonb",
    "newsletter_frequency" "text" DEFAULT 'weekly'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_profiles_newsletter_frequency_check" CHECK (("newsletter_frequency" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'never'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_courses"
    ADD CONSTRAINT "canvas_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_courses"
    ADD CONSTRAINT "canvas_courses_user_id_canvas_course_id_key" UNIQUE ("user_id", "canvas_course_id");



ALTER TABLE ONLY "public"."canvas_integrations"
    ADD CONSTRAINT "canvas_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."canvas_integrations"
    ADD CONSTRAINT "canvas_integrations_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_user_id_flashcard_id_key" UNIQUE ("user_id", "flashcard_id");



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_content"
    ADD CONSTRAINT "generated_content_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."learning_sessions"
    ADD CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_set_collaborators"
    ADD CONSTRAINT "study_set_collaborators_pkey" PRIMARY KEY ("study_set_id", "user_id");



ALTER TABLE ONLY "public"."study_set_tags"
    ADD CONSTRAINT "study_set_tags_pkey" PRIMARY KEY ("study_set_id", "tag_id");



ALTER TABLE ONLY "public"."study_sets"
    ADD CONSTRAINT "study_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."user_analytics"
    ADD CONSTRAINT "user_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_analytics"
    ADD CONSTRAINT "user_analytics_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_calendar_events_upcoming" ON "public"."calendar_events" USING "btree" ("user_id", "scheduled_date") WHERE ("completed" = false);



CREATE INDEX "idx_calendar_events_user" ON "public"."calendar_events" USING "btree" ("user_id", "scheduled_date");



CREATE INDEX "idx_canvas_courses_user" ON "public"."canvas_courses" USING "btree" ("user_id");



CREATE INDEX "idx_flashcard_progress_mastery" ON "public"."flashcard_progress" USING "btree" ("user_id", "mastery_level");



CREATE INDEX "idx_flashcard_progress_next_review" ON "public"."flashcard_progress" USING "btree" ("user_id", "next_review_date") WHERE ("next_review_date" IS NOT NULL);



CREATE INDEX "idx_flashcard_progress_user" ON "public"."flashcard_progress" USING "btree" ("user_id");



CREATE INDEX "idx_flashcards_order" ON "public"."flashcards" USING "btree" ("study_set_id", "card_order");



CREATE INDEX "idx_flashcards_starred" ON "public"."flashcards" USING "btree" ("study_set_id", "starred") WHERE (("starred" = true) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_flashcards_study_set" ON "public"."flashcards" USING "btree" ("study_set_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_generated_content_status" ON "public"."generated_content" USING "btree" ("status") WHERE ("status" <> 'completed'::"text");



CREATE INDEX "idx_generated_content_study_set" ON "public"."generated_content" USING "btree" ("study_set_id", "content_type");



CREATE INDEX "idx_generated_content_user" ON "public"."generated_content" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_learning_sessions_study_set" ON "public"."learning_sessions" USING "btree" ("study_set_id", "started_at" DESC);



CREATE INDEX "idx_learning_sessions_user" ON "public"."learning_sessions" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_study_set_tags_study_set" ON "public"."study_set_tags" USING "btree" ("study_set_id");



CREATE INDEX "idx_study_set_tags_tag" ON "public"."study_set_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_study_sets_created_at" ON "public"."study_sets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_study_sets_subject" ON "public"."study_sets" USING "btree" ("subject_area") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_study_sets_user_id" ON "public"."study_sets" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_user_analytics_user_date" ON "public"."user_analytics" USING "btree" ("user_id", "date" DESC);



CREATE OR REPLACE VIEW "public"."study_set_overview" AS
 SELECT "ss"."id",
    "ss"."user_id",
    "ss"."title",
    "ss"."description",
    "ss"."subject_area",
    "ss"."cover_image_url",
    "ss"."color_theme",
    "ss"."total_cards",
    "ss"."created_at",
    "ss"."updated_at",
    "count"(DISTINCT "fp"."id") FILTER (WHERE ("fp"."mastery_level" = 'mastered'::"text")) AS "mastered_cards",
    "count"(DISTINCT "ls"."id") AS "total_sessions",
    "sum"("ls"."duration_seconds") AS "total_study_time_seconds",
    COALESCE("avg"(
        CASE
            WHEN ("ls"."cards_reviewed" > 0) THEN ((("ls"."cards_correct")::double precision / ("ls"."cards_reviewed")::double precision) * (100)::double precision)
            ELSE NULL::double precision
        END), (0)::double precision) AS "average_accuracy"
   FROM ((("public"."study_sets" "ss"
     LEFT JOIN "public"."flashcards" "f" ON (("f"."study_set_id" = "ss"."id")))
     LEFT JOIN "public"."flashcard_progress" "fp" ON (("fp"."flashcard_id" = "f"."id")))
     LEFT JOIN "public"."learning_sessions" "ls" ON (("ls"."study_set_id" = "ss"."id")))
  WHERE ("ss"."deleted_at" IS NULL)
  GROUP BY "ss"."id";



CREATE OR REPLACE TRIGGER "update_calendar_events_updated_at" BEFORE UPDATE ON "public"."calendar_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_canvas_integrations_updated_at" BEFORE UPDATE ON "public"."canvas_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_card_count_on_delete" AFTER DELETE ON "public"."flashcards" FOR EACH ROW EXECUTE FUNCTION "public"."update_study_set_card_count"();



CREATE OR REPLACE TRIGGER "update_card_count_on_insert" AFTER INSERT ON "public"."flashcards" FOR EACH ROW EXECUTE FUNCTION "public"."update_study_set_card_count"();



CREATE OR REPLACE TRIGGER "update_flashcard_progress_updated_at" BEFORE UPDATE ON "public"."flashcard_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_flashcards_updated_at" BEFORE UPDATE ON "public"."flashcards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_generated_content_updated_at" BEFORE UPDATE ON "public"."generated_content" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_study_sets_updated_at" BEFORE UPDATE ON "public"."study_sets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "public"."study_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_events"
    ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_courses"
    ADD CONSTRAINT "canvas_courses_canvas_integration_id_fkey" FOREIGN KEY ("canvas_integration_id") REFERENCES "public"."canvas_integrations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_courses"
    ADD CONSTRAINT "canvas_courses_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "public"."study_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."canvas_courses"
    ADD CONSTRAINT "canvas_courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."canvas_integrations"
    ADD CONSTRAINT "canvas_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_flashcard_id_fkey" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "public"."study_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcard_progress"
    ADD CONSTRAINT "flashcard_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."flashcards"
    ADD CONSTRAINT "flashcards_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "public"."study_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_content"
    ADD CONSTRAINT "generated_content_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "public"."study_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_content"
    ADD CONSTRAINT "generated_content_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_sessions"
    ADD CONSTRAINT "learning_sessions_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "public"."study_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."learning_sessions"
    ADD CONSTRAINT "learning_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_set_collaborators"
    ADD CONSTRAINT "study_set_collaborators_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "public"."study_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_set_collaborators"
    ADD CONSTRAINT "study_set_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_set_tags"
    ADD CONSTRAINT "study_set_tags_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "public"."study_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_set_tags"
    ADD CONSTRAINT "study_set_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_sets"
    ADD CONSTRAINT "study_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_analytics"
    ADD CONSTRAINT "user_analytics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete flashcards in their study sets" ON "public"."flashcards" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."study_sets"
  WHERE (("study_sets"."id" = "flashcards"."study_set_id") AND ("study_sets"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own study sets" ON "public"."study_sets" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert flashcards to their study sets" ON "public"."flashcards" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."study_sets"
  WHERE (("study_sets"."id" = "flashcards"."study_set_id") AND (("study_sets"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."study_set_collaborators"
          WHERE (("study_set_collaborators"."study_set_id" = "study_sets"."id") AND ("study_set_collaborators"."user_id" = "auth"."uid"()) AND ("study_set_collaborators"."role" = ANY (ARRAY['owner'::"text", 'editor'::"text"]))))))))));



CREATE POLICY "Users can insert their own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own study sets" ON "public"."study_sets" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage tags on their study sets" ON "public"."study_set_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."study_sets"
  WHERE (("study_sets"."id" = "study_set_tags"."study_set_id") AND ("study_sets"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own Canvas integration" ON "public"."canvas_integrations" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own calendar" ON "public"."calendar_events" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own tags" ON "public"."tags" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update flashcards in their study sets" ON "public"."flashcards" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."study_sets"
  WHERE (("study_sets"."id" = "flashcards"."study_set_id") AND (("study_sets"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."study_set_collaborators"
          WHERE (("study_set_collaborators"."study_set_id" = "study_sets"."id") AND ("study_set_collaborators"."user_id" = "auth"."uid"()) AND ("study_set_collaborators"."role" = ANY (ARRAY['owner'::"text", 'editor'::"text"]))))))))));



CREATE POLICY "Users can update their own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own study sets" ON "public"."study_sets" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."study_set_collaborators"
  WHERE (("study_set_collaborators"."study_set_id" = "study_sets"."id") AND ("study_set_collaborators"."user_id" = "auth"."uid"()) AND ("study_set_collaborators"."role" = ANY (ARRAY['owner'::"text", 'editor'::"text"])))))));



CREATE POLICY "Users can view collaborators of accessible study sets" ON "public"."study_set_collaborators" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."study_sets"
  WHERE (("study_sets"."id" = "study_set_collaborators"."study_set_id") AND ("study_sets"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view flashcards from accessible study sets" ON "public"."flashcards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."study_sets"
  WHERE (("study_sets"."id" = "flashcards"."study_set_id") AND (("study_sets"."user_id" = "auth"."uid"()) OR ("study_sets"."is_public" = true) OR (EXISTS ( SELECT 1
           FROM "public"."study_set_collaborators"
          WHERE (("study_set_collaborators"."study_set_id" = "study_sets"."id") AND ("study_set_collaborators"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Users can view tags on accessible study sets" ON "public"."study_set_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."study_sets"
  WHERE (("study_sets"."id" = "study_set_tags"."study_set_id") AND (("study_sets"."user_id" = "auth"."uid"()) OR ("study_sets"."is_public" = true))))));



CREATE POLICY "Users can view their own Canvas courses" ON "public"."canvas_courses" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own analytics" ON "public"."user_analytics" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own generated content" ON "public"."generated_content" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own progress" ON "public"."flashcard_progress" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own sessions" ON "public"."learning_sessions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own study sets" ON "public"."study_sets" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_public" = true) OR (EXISTS ( SELECT 1
   FROM "public"."study_set_collaborators"
  WHERE (("study_set_collaborators"."study_set_id" = "study_sets"."id") AND ("study_set_collaborators"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."calendar_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canvas_courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."canvas_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flashcard_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flashcards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."learning_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_set_collaborators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_set_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_sets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."update_study_set_card_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_study_set_card_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_study_set_card_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."calendar_events" TO "anon";
GRANT ALL ON TABLE "public"."calendar_events" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_events" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_courses" TO "anon";
GRANT ALL ON TABLE "public"."canvas_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_courses" TO "service_role";



GRANT ALL ON TABLE "public"."canvas_integrations" TO "anon";
GRANT ALL ON TABLE "public"."canvas_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."canvas_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."flashcard_progress" TO "anon";
GRANT ALL ON TABLE "public"."flashcard_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcard_progress" TO "service_role";



GRANT ALL ON TABLE "public"."flashcards" TO "anon";
GRANT ALL ON TABLE "public"."flashcards" TO "authenticated";
GRANT ALL ON TABLE "public"."flashcards" TO "service_role";



GRANT ALL ON TABLE "public"."study_sets" TO "anon";
GRANT ALL ON TABLE "public"."study_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."study_sets" TO "service_role";



GRANT ALL ON TABLE "public"."cards_due_for_review" TO "anon";
GRANT ALL ON TABLE "public"."cards_due_for_review" TO "authenticated";
GRANT ALL ON TABLE "public"."cards_due_for_review" TO "service_role";



GRANT ALL ON TABLE "public"."generated_content" TO "anon";
GRANT ALL ON TABLE "public"."generated_content" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_content" TO "service_role";



GRANT ALL ON TABLE "public"."learning_sessions" TO "anon";
GRANT ALL ON TABLE "public"."learning_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."study_set_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."study_set_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."study_set_collaborators" TO "service_role";



GRANT ALL ON TABLE "public"."study_set_overview" TO "anon";
GRANT ALL ON TABLE "public"."study_set_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."study_set_overview" TO "service_role";



GRANT ALL ON TABLE "public"."study_set_tags" TO "anon";
GRANT ALL ON TABLE "public"."study_set_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."study_set_tags" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."user_analytics" TO "anon";
GRANT ALL ON TABLE "public"."user_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."user_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































