-- A user's private calendar feed of their due dates: one row per user, holding
-- the hash of the token in the feed's address, never the token itself, as an
-- enrollment link does. Making a new link replaces the row, so the old address
-- stops answering; turning the feed off deletes it.
CREATE TABLE `calendar_feeds` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  `token_hash` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feeds_token_hash_unique` ON `calendar_feeds` (`token_hash`);
