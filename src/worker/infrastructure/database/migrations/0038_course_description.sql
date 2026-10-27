-- A course description students see at the top of the course page: the
-- syllabus link, office hours, the textbook. Kept the way the About page is,
-- as the Carnap Markdown the instructor wrote and the HTML it compiled to, so
-- the editor shows the source again and a reader is served the HTML without
-- compiling anything. Both are null for a course with no description, which
-- is every course this runs over.
ALTER TABLE `courses` ADD `description_source` text;
--> statement-breakpoint
ALTER TABLE `courses` ADD `description_html` text;
