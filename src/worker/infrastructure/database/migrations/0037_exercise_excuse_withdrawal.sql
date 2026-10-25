-- An excused exercise can be reinstated (gh #24). Excusing never touched a
-- student's work: it only took the exercise out of the assignment's score and
-- its total, so reinstating puts the scores back from the evidence already on
-- file. The excuse row stays, marked `withdrawn` with when and by whom, so the
-- corrections ledger still shows that the exercise was excused and then
-- counted again.
--
-- Only an excuse still in force is unique per exercise, so an exercise that
-- was reinstated can be excused again. Every row this runs over is `excused`,
-- so the narrower index holds for them as the old one did.
ALTER TABLE `assignment_exercise_excuses` ADD `withdrawn_at` text;
--> statement-breakpoint
ALTER TABLE `assignment_exercise_excuses` ADD `withdrawn_by_id` text REFERENCES users(id) ON DELETE RESTRICT;
--> statement-breakpoint
DROP INDEX `assignment_exercise_excuses_assignment_exercise_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_exercise_excuses_in_force_unique` ON `assignment_exercise_excuses` (`assignment_id`,`exercise_id`) WHERE `status` = 'excused';
