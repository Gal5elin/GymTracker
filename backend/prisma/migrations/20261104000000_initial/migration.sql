-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'TRAINER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TrainerLinkStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "WorkoutStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_links" (
    "id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "status" "TrainerLinkStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "muscle_group" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_programs" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_days" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "day_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_exercises" (
    "id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "target_sets" INTEGER NOT NULL,
    "target_reps" INTEGER NOT NULL,
    "target_weight_kg" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_assignments" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "assigned_by" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sessions" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "assignment_id" UUID,
    "program_day_id" UUID NOT NULL,
    "status" "WorkoutStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_sets" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "exercise_position" INTEGER NOT NULL,
    "set_number" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight_kg" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "trainer_links_trainer_id_member_id_status_idx" ON "trainer_links"("trainer_id", "member_id", "status");

-- CreateIndex
CREATE INDEX "trainer_links_member_id_status_idx" ON "trainer_links"("member_id", "status");

-- CreateIndex
CREATE INDEX "workout_programs_owner_id_idx" ON "workout_programs"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_days_program_id_day_number_key" ON "program_days"("program_id", "day_number");

-- CreateIndex
CREATE INDEX "program_exercises_exercise_id_idx" ON "program_exercises"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_exercises_day_id_position_key" ON "program_exercises"("day_id", "position");

-- CreateIndex
CREATE INDEX "program_assignments_program_id_idx" ON "program_assignments"("program_id");

-- CreateIndex
CREATE INDEX "program_assignments_member_id_idx" ON "program_assignments"("member_id");

-- CreateIndex
CREATE INDEX "program_assignments_assigned_by_idx" ON "program_assignments"("assigned_by");

-- CreateIndex
CREATE INDEX "workout_sessions_member_id_started_at_idx" ON "workout_sessions"("member_id", "started_at");

-- CreateIndex
CREATE INDEX "workout_sessions_assignment_id_idx" ON "workout_sessions"("assignment_id");

-- CreateIndex
CREATE INDEX "workout_sessions_program_day_id_idx" ON "workout_sessions"("program_day_id");

-- CreateIndex
CREATE INDEX "session_sets_exercise_id_idx" ON "session_sets"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_sets_session_id_exercise_position_set_number_key" ON "session_sets"("session_id", "exercise_position", "set_number");

-- AddForeignKey
ALTER TABLE "trainer_links" ADD CONSTRAINT "trainer_links_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_links" ADD CONSTRAINT "trainer_links_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_programs" ADD CONSTRAINT "workout_programs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "workout_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "program_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "workout_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "program_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_program_day_id_fkey" FOREIGN KEY ("program_day_id") REFERENCES "program_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain value constraints not expressible in the Prisma schema.
ALTER TABLE "trainer_links" ADD CONSTRAINT "trainer_links_distinct_users" CHECK ("trainer_id" <> "member_id");
ALTER TABLE "program_days" ADD CONSTRAINT "program_days_positive_number" CHECK ("day_number" > 0);
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_valid_targets" CHECK ("position" > 0 AND "target_sets" > 0 AND "target_reps" > 0 AND ("target_weight_kg" IS NULL OR "target_weight_kg" >= 0));
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_valid_values" CHECK ("exercise_position" > 0 AND "set_number" > 0 AND "reps" > 0 AND ("weight_kg" IS NULL OR "weight_kg" >= 0));
