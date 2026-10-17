CREATE TABLE source_settings (
 id text PRIMARY KEY NOT NULL,
 bridge_url text NOT NULL,
 secret_cipher text NOT NULL,
 enabled integer NOT NULL DEFAULT 1,
 revision integer NOT NULL DEFAULT 1,
 last_checked text NOT NULL,
 updated_by text NOT NULL
);
