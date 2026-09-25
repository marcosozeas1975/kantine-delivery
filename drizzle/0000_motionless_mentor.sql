CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"pickup_location" text DEFAULT 'Kantine Matriz' NOT NULL,
	"destination_address" text NOT NULL,
	"destination_neighborhood" text NOT NULL,
	"cargo_description" text NOT NULL,
	"delivery_fee" text NOT NULL,
	"delivery_mode" text DEFAULT 'IN_PERSON' NOT NULL,
	"observations" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"offered_at" timestamp,
	"accepted_driver_id" integer,
	"accepted_at" timestamp,
	CONSTRAINT "deliveries_status_check" CHECK ("deliveries"."status" IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'CANCELLED')),
	CONSTRAINT "deliveries_mode_check" CHECK ("deliveries"."delivery_mode" IN ('IN_PERSON', 'NO_CONTACT')),
	CONSTRAINT "deliveries_accepted_integrity_check" CHECK (("deliveries"."status" = 'ACCEPTED' AND "deliveries"."accepted_driver_id" IS NOT NULL AND "deliveries"."accepted_at" IS NOT NULL) OR ("deliveries"."status" != 'ACCEPTED'))
);
--> statement-breakpoint
CREATE TABLE "delivery_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"actor" text
);
--> statement-breakpoint
CREATE TABLE "delivery_offer_dispatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"telegram_message_id" text,
	"status" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"error_code" text,
	CONSTRAINT "delivery_driver_unique" UNIQUE("delivery_id","driver_id"),
	CONSTRAINT "dispatches_status_check" CHECK ("delivery_offer_dispatches"."status" IN ('SENT', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "driver_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text,
	"actor_id" text,
	"field_changed" text,
	"old_value" text,
	"new_value" text,
	"details" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_user_id" text NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"pix_key" text,
	"pix_key_type" text DEFAULT 'REQUIRES_UPDATE' NOT NULL,
	"pix_key_value" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_telegram_user_id_unique" UNIQUE("telegram_user_id"),
	CONSTRAINT "drivers_status_check" CHECK ("drivers"."status" IN ('PENDING', 'ACTIVE', 'BLOCKED')),
	CONSTRAINT "drivers_vehicle_type_canonical_check" CHECK ("drivers"."vehicle_type" IN ('CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'MOTO_WITH_BAG', 'MOTO_WITHOUT_BAG', 'OTHER')),
	CONSTRAINT "drivers_pix_key_type_check" CHECK ("drivers"."pix_key_type" IN ('CPF', 'PHONE', 'EMAIL', 'RANDOM', 'REQUIRES_UPDATE'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_accepted_driver_id_drivers_id_fk" FOREIGN KEY ("accepted_driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offer_dispatches" ADD CONSTRAINT "delivery_offer_dispatches_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_offer_dispatches" ADD CONSTRAINT "delivery_offer_dispatches_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_events" ADD CONSTRAINT "driver_events_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;