-- The single-use links behind changing an account's address (gh #10): one
-- table for both kinds, since they are the same shape read from opposite ends.
--
-- `confirm` is sent to the address an account holder asked to move to. Opening
-- it proves the new mailbox, and only then does the address change. It moves
-- the account from `from_email` to `to_email`, and is refused if the account no
-- longer holds `from_email` by then.
--
-- `undo` is sent to the address a change moved an account away from. It moves
-- the account back from `to_email` to `from_email`, restoring the source the
-- address had (`restore_source`, `restore_platform_id`): the answer to a change
-- the old mailbox's holder did not make, or made by mistake. While one is
-- pending, `from_email` is held for its account. No other account may take it,
-- and signing in with it leads to the undo rather than to a fresh, empty
-- account. An account has at most one pending: a later change carries it
-- forward to the new address rather than replacing it, so that it still puts
-- back the address the earliest change took away, and an administrator's
-- change cancels it.
--
-- Rows are swept on each insert once expired, as the other single-use tables'
-- are.
CREATE TABLE `email_change_tokens` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `user_id` text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  `from_email` text NOT NULL,
  `to_email` text NOT NULL,
  `restore_source` text,
  `restore_platform_id` text REFERENCES lti_platforms(id) ON DELETE SET NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `consumed_at` text
);
--> statement-breakpoint
CREATE INDEX `email_change_tokens_user_idx` ON `email_change_tokens` (`user_id`,`kind`);
--> statement-breakpoint
CREATE INDEX `email_change_tokens_from_email_idx` ON `email_change_tokens` (`from_email`,`kind`);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_change_tokens_pending_undo_unique` ON `email_change_tokens` (`user_id`) WHERE `kind` = 'undo' AND `consumed_at` IS NULL;
