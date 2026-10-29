-- Whether the exercise widgets answer a key pressed on its own (p, ?, 3) as
-- a shortcut. On for every account, which is how they have always behaved; a
-- reader who speaks commands or presses keys by accident turns it off on
-- their profile, and the same shortcuts stay on Alt with the key.
ALTER TABLE `users` ADD `single_key_shortcuts` integer DEFAULT true NOT NULL;
