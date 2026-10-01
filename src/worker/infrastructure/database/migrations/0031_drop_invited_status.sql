-- The invited status was never an invitation. Nothing produced one but an
-- instructor or administrator picking it for someone already in the course,
-- and it then meant "suspended until their next LMS launch": an LTI launch
-- activated it, while an enrollment link refused it as inactive. A status that
-- quietly readmits an LTI student and locks out a native one only asked the
-- person choosing it to guess which, so any left over become suspended.
UPDATE `course_memberships` SET `status` = 'suspended' WHERE `status` = 'invited';
