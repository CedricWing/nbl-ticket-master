CREATE TYPE "public"."role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('upcoming', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."seat_status" AS ENUM('available', 'booked', 'reserved_season');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('confirmed', 'refunded');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"status" "game_status" DEFAULT 'upcoming' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "games_distinct_teams" CHECK ("games"."home_team_id" <> "games"."away_team_id")
);
--> statement-breakpoint
CREATE TABLE "season_seat_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_seat_assignments_seat_template_id_unique" UNIQUE("seat_template_id")
);
--> statement-breakpoint
CREATE TABLE "seat_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"section" text NOT NULL,
	"row" text NOT NULL,
	"seat_number" integer NOT NULL,
	"price_cents" integer NOT NULL,
	CONSTRAINT "seat_templates_price_non_negative" CHECK ("seat_templates"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"seat_template_id" uuid,
	"section" text NOT NULL,
	"row" text NOT NULL,
	"seat_number" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"status" "seat_status" DEFAULT 'available' NOT NULL,
	CONSTRAINT "seats_price_non_negative" CHECK ("seats"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"home_venue" text NOT NULL,
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "ticket_status" DEFAULT 'confirmed' NOT NULL,
	"price_cents" integer NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refunded_at" timestamp with time zone,
	"refunded_by" uuid,
	CONSTRAINT "tickets_price_non_negative" CHECK ("tickets"."price_cents" >= 0),
	CONSTRAINT "tickets_refund_consistency" CHECK ((status = 'confirmed' AND refunded_at IS NULL AND refunded_by IS NULL)
        OR (status = 'refunded' AND refunded_at IS NOT NULL AND refunded_by IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_seat_assignments" ADD CONSTRAINT "season_seat_assignments_seat_template_id_seat_templates_id_fk" FOREIGN KEY ("seat_template_id") REFERENCES "public"."seat_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_seat_assignments" ADD CONSTRAINT "season_seat_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_templates" ADD CONSTRAINT "seat_templates_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_seat_template_id_seat_templates_id_fk" FOREIGN KEY ("seat_template_id") REFERENCES "public"."seat_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_status_starts_at_idx" ON "games" USING btree ("status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_templates_seat_unique" ON "seat_templates" USING btree ("team_id","section","row","seat_number");--> statement-breakpoint
CREATE UNIQUE INDEX "seats_game_seat_unique" ON "seats" USING btree ("game_id","section","row","seat_number");--> statement-breakpoint
CREATE INDEX "seats_game_id_idx" ON "seats" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_active_seat_unique" ON "tickets" USING btree ("seat_id") WHERE "tickets"."status" = 'confirmed';--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_user_idempotency_key_unique" ON "tickets" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "tickets_user_id_idx" ON "tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_game_id_idx" ON "tickets" USING btree ("game_id");