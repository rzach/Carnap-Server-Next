-- Who owns an account's email address, so that a launch can tell a change its
-- platform made from an address the account holder chose (gh #10).
--
-- Until now every launch whose asserted address differed from the account's
-- adopted it, which made the LMS the only owner there could be: an address the
-- holder set would be undone by their next launch, and an account linked to two
-- platforms would flip between them once either changed its record. With a
-- source recorded, a launch adopts only a change its platform has just made
-- (`asserted_email` is the last address that platform sent), and only while the
-- address is the LMS's to change.
--
-- `email_source` is `lti`, `user` or `admin`. `email_source_platform_id` names
-- the platform an `lti` address came from, for the profile's "From Moodle"; it
-- is a fact about where the address came from and outlives unlinking that
-- platform, so it references the platform rather than the identity.
--
-- The backfill keeps what each account has always done. Every account with an
-- LMS identity has been following its LMS, so it is LMS-sourced, from the most
-- recently linked platform. Every other account was made by a native sign-in
-- with an address its holder typed. `asserted_email` starts empty, which the
-- application reads as "nothing recorded yet": the first launch after this
-- counts as new, exactly as every launch did before it.
ALTER TABLE `users` ADD `email_source` text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `email_source_platform_id` text REFERENCES lti_platforms(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `external_identities` ADD `asserted_email` text;
--> statement-breakpoint
UPDATE `users`
SET
  `email_source` = 'lti',
  `email_source_platform_id` = (
    SELECT `lti_platforms`.`id`
    FROM `external_identities`
    JOIN `lti_platforms`
      ON `lti_platforms`.`id` = substr(
        `external_identities`.`provider_subject`,
        1,
        instr(`external_identities`.`provider_subject`, ':') - 1
      )
    WHERE `external_identities`.`user_id` = `users`.`id`
      AND `external_identities`.`provider` = 'lti'
    ORDER BY `external_identities`.`created_at` DESC, `external_identities`.`id` DESC
    LIMIT 1
  )
WHERE EXISTS (
  SELECT 1
  FROM `external_identities`
  WHERE `external_identities`.`user_id` = `users`.`id`
    AND `external_identities`.`provider` = 'lti'
);
