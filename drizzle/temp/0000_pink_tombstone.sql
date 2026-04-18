CREATE TABLE "bank_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"condition_type" text NOT NULL,
	"condition_value" text NOT NULL,
	"transaction_direction" text DEFAULT 'any' NOT NULL,
	"gl_account_id" text NOT NULL,
	"auto_add" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
