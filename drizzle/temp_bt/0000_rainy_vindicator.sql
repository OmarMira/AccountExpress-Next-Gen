CREATE TABLE "bank_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"bank_account" text NOT NULL,
	"transaction_date" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"transaction_type" text NOT NULL,
	"reference_number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"gl_account_id" text,
	"journal_entry_id" text,
	"matched_by" text,
	"matched_at" timestamp with time zone,
	"import_batch_id" text,
	"applied_rule_id" text,
	"created_at" timestamp with time zone NOT NULL
);
