-- Instance-wide settings an administrator changes at runtime, one row per
-- setting. The first is `native_registration`: `public`, `link_only` or
-- `lms_only`, which says who may create an account by signing in with an
-- email link. A missing row means the setting's default (`public`), so a fresh
-- database needs no seed and an upgraded one keeps today's behaviour.
CREATE TABLE `site_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by_id` text REFERENCES users(id) ON DELETE SET NULL
);
