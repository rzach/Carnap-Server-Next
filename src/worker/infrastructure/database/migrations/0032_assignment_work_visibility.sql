-- When a student may read back their own submitted work — the prompts and
-- answers on their results page — independently of when the grades come out.
-- The worry it answers is leakage between sections sitting the same exam: an
-- instructor can release the scores and still keep the worked answers in.
--
-- A choice and a timestamp rather than a timestamp alone. `with_grades` has to
-- follow `grades_visible_at` as it changes, since a release button can move it
-- at any time, and `immediate` and `never` both have no time to store.
--
-- The column default is `immediate`, which is what every assignment that exists
-- when this runs has always done: the results page has shown the work before
-- release since the work was first put there. New assignments are written with
-- `with_grades` by the application, never by this default.
ALTER TABLE `assignments` ADD `work_visibility` text DEFAULT 'immediate' NOT NULL;
--> statement-breakpoint
ALTER TABLE `assignments` ADD `work_visible_at` text;
