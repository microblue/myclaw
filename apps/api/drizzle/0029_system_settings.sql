CREATE TABLE IF NOT EXISTS "system_settings" (
    "key" text PRIMARY KEY,
    "value" text,
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_by" text
);
