import type { Assignment } from "../domain/assignments";
import type { Course } from "../domain/courses";
import { type Timestamp, timestampNow } from "../domain/time";
import type { User } from "../domain/users";
import { assignmentsAsAppliedTo } from "./assignment-lookup";
import type { AuthenticatedActor } from "./auth";
import type { AppStores, CalendarFeed } from "./stores";
import { createAuthToken, hashAuthToken } from "./tokens";

/** One due date in a feed: the assignment as applied to the feed's owner. */
export interface CalendarFeedEntry {
  readonly assignment: Assignment;
  readonly course: Course;
  /** The assignment's due date for them, which every entry has. */
  readonly dueAt: Timestamp;
}

export interface CalendarFeedContents {
  readonly entries: readonly CalendarFeedEntry[];
  readonly user: User;
}

/**
 * Each user's private calendar feed: the due dates of every course they are
 * an active member of, in a form a calendar app subscribes to.
 *
 * The feed is read by a calendar app, not a browser, so its address carries
 * the only credential: a token, kept as its hash as an enrollment link's is,
 * and shown to its owner once, when made. Making a new link replaces the old
 * one, which is the remedy for a link that went somewhere it should not have.
 */
export class CalendarService {
  constructor(
    private readonly options: {
      readonly now?: () => Date;
      readonly stores: AppStores;
    },
  ) {}

  /** Make the actor a new feed link, retiring any they had. */
  async replaceFeed(
    actor: AuthenticatedActor,
  ): Promise<{ readonly feed: CalendarFeed; readonly token: string }> {
    const token = createAuthToken("acal");
    const feed = await this.options.stores.calendarFeeds.replace({
      createdAt: timestampNow(this.options.now?.() ?? new Date()),
      tokenHash: await hashAuthToken(token),
      userId: actor.user.id,
    });

    return { feed, token };
  }

  /** Turn the actor's feed off: its link stops answering. */
  turnOffFeed(actor: AuthenticatedActor): Promise<void> {
    return this.options.stores.calendarFeeds.delete(actor.user.id);
  }

  /**
   * The feed a token opens, or null: an unknown token, a replaced one, and a
   * disabled account's all answer alike. Every course the owner is an active
   * member of, archived ones aside, with each dated assignment as they see it
   * on their course page — staff included, since a teaching assistant's
   * deadlines are the class's.
   */
  async readFeed(token: string): Promise<CalendarFeedContents | null> {
    if (token.trim().length === 0) {
      return null;
    }

    const { stores } = this.options;
    const feed = await stores.calendarFeeds.getByTokenHash(
      await hashAuthToken(token),
    );
    const user =
      feed === null ? null : await stores.users.getById(feed.userId);

    if (user === null || user.disabledAt !== null) {
      return null;
    }

    const courses = (await stores.courses.listForUser(user.id))
      .filter(
        ({ course, membership }) =>
          membership.status === "active" && course.archivedAt === null,
      )
      .map(({ course }) => course);
    const perCourse = await Promise.all(
      courses.map(async (course) =>
        (await assignmentsAsAppliedTo(stores, course.id, user.id)).flatMap(
          (assignment) =>
            assignment.dueAt === null
              ? []
              : [{ assignment, course, dueAt: assignment.dueAt }],
        ),
      ),
    );

    return { entries: perCourse.flat(), user };
  }
}
