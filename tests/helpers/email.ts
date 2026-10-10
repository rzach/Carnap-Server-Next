/**
 * Enough of a Resend account for the senders in
 * `infrastructure/email/resend.ts` to build a real one; the fetch it posts to
 * is captured rather than made.
 */
export const EMAIL_ENV = {
  AUTH_LOGIN_EMAIL_FROM: "Carnap <login@example.test>",
  RESEND_API_KEY: "test-api-key",
} as const;

export interface SentEmail {
  readonly html: string;
  readonly subject: string;
  readonly text: string;
  readonly to: readonly string[];
}

/**
 * Run `body` with the transactional emails captured instead of delivered.
 *
 * The sender reads the global `fetch` at call time, so replacing it here is
 * what makes a mail's recipient, language and link observable — properties
 * that live in the message, not in the response.
 */
export async function capturingEmail<T>(
  body: (sent: SentEmail[]) => Promise<T>,
): Promise<T> {
  const sent: SentEmail[] = [];
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = new Request(input, init);

    if (new URL(request.url).host === "api.resend.com") {
      sent.push((await request.json()) as SentEmail);

      return Response.json({ id: `email-${sent.length}` });
    }

    return realFetch(input as RequestInfo, init);
  }) as typeof globalThis.fetch;

  try {
    return await body(sent);
  } finally {
    globalThis.fetch = realFetch;
  }
}
