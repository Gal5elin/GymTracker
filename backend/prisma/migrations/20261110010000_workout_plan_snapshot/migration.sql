-- Old sessions cannot be given an accurate historical plan retroactively.
-- NULL identifies legacy sessions; all starts through the new API save a versioned snapshot.
ALTER TABLE "workout_sessions" ADD COLUMN "plan_snapshot" JSONB;
