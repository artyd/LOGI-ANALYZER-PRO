CREATE TABLE "adr_substance" (
	"id" serial PRIMARY KEY NOT NULL,
	"aliases" jsonb,
	"un_number" varchar(8),
	"class" varchar(8),
	"packing_group" varchar(4),
	"label" text,
	"description" text,
	"dataset_version_id" integer
);
--> statement-breakpoint
CREATE TABLE "code_alias" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(10) NOT NULL,
	"alias_text" text NOT NULL,
	"lang" varchar(4),
	"source" varchar(24)
);
--> statement-breakpoint
CREATE TABLE "dataset_source" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"url" text,
	"license" text,
	"retrieved_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dataset_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"version_label" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"imported_at" timestamp with time zone DEFAULT now(),
	"row_count" integer,
	"checksum" text
);
--> statement-breakpoint
CREATE TABLE "duty_rate" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(10) NOT NULL,
	"regime" varchar(16) NOT NULL,
	"origin_group" varchar(32),
	"rate_percent" numeric(6, 3),
	"rate_specific_json" jsonb,
	"source" varchar(16) DEFAULT 'db' NOT NULL,
	"dataset_version_id" integer
);
--> statement-breakpoint
CREATE TABLE "excise_rate" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(10) NOT NULL,
	"basis" varchar(16),
	"amount" numeric(12, 4),
	"currency" varchar(3),
	"unit" varchar(16),
	"dataset_version_id" integer
);
--> statement-breakpoint
CREATE TABLE "hs_code" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"level" varchar(12) NOT NULL,
	"parent_code" varchar(10),
	"description_uk" text,
	"description_en" text
);
--> statement-breakpoint
CREATE TABLE "manufacturer" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb,
	"country" varchar(2),
	"origin_hint" varchar(24),
	"gmp_status" text,
	"dataset_version_id" integer
);
--> statement-breakpoint
CREATE TABLE "precursor" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_uk" text,
	"name_en" text,
	"name_regex" text,
	"code_regex" text,
	"schedule" integer,
	"note" text,
	"dataset_version_id" integer
);
--> statement-breakpoint
CREATE TABLE "product_origin" (
	"id" serial PRIMARY KEY NOT NULL,
	"aliases" jsonb NOT NULL,
	"origin_type" varchar(24),
	"production_method" text,
	"category" text,
	"confidence" varchar(8),
	"dataset_version_id" integer
);
--> statement-breakpoint
CREATE TABLE "rule" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"scope" varchar(16) NOT NULL,
	"applies_when" jsonb NOT NULL,
	"effect" jsonb NOT NULL,
	"severity" varchar(12),
	"citation_url" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"dataset_version_id" integer
);
--> statement-breakpoint
CREATE TABLE "vat_rate" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(10) NOT NULL,
	"country" varchar(2) DEFAULT 'UA' NOT NULL,
	"rate_percent" numeric(5, 2) NOT NULL,
	"requires_registration" boolean DEFAULT false NOT NULL,
	"condition_note" text,
	"dataset_version_id" integer
);
--> statement-breakpoint
ALTER TABLE "adr_substance" ADD CONSTRAINT "adr_substance_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_version" ADD CONSTRAINT "dataset_version_source_id_dataset_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."dataset_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_rate" ADD CONSTRAINT "duty_rate_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excise_rate" ADD CONSTRAINT "excise_rate_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturer" ADD CONSTRAINT "manufacturer_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precursor" ADD CONSTRAINT "precursor_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_origin" ADD CONSTRAINT "product_origin_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule" ADD CONSTRAINT "rule_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_rate" ADD CONSTRAINT "vat_rate_dataset_version_id_dataset_version_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_alias_code_idx" ON "code_alias" USING btree ("code");--> statement-breakpoint
CREATE INDEX "duty_rate_code_idx" ON "duty_rate" USING btree ("code","regime");--> statement-breakpoint
CREATE INDEX "hs_code_parent_idx" ON "hs_code" USING btree ("parent_code");--> statement-breakpoint
CREATE INDEX "rule_scope_idx" ON "rule" USING btree ("scope","priority");--> statement-breakpoint
CREATE INDEX "vat_rate_code_idx" ON "vat_rate" USING btree ("code");