/**
 * The MMB certificate an answer envelope carries, read once for the five
 * exercise types that grade one: the four proof types and translation.
 *
 * The certificate is the graded input and nothing more. The worker verifies it
 * against the frozen theory in `evaluate`, records the verdict, and lets it go:
 * it is not part of the answer that is stored. A stored answer keeps what the
 * certificate was compiled from — the `.auf`, the Fitch source, the tree, the
 * translation — which is enough to compile it again should a verdict ever be
 * questioned, at a tenth of the size. See [[aufbau-engine-packages]].
 */

import type { AnswerNormalizationResult } from "../../domain/content";
import { diagnostic } from "../assessment";

/** Generous cap so an intro proof passes but a submission can't be unbounded. */
export const MAX_CERTIFICATE_BASE64_LENGTH = 262_144;

/**
 * Whether an envelope's `mmb` is a string longer than the cap (the shared one
 * unless a type gives its own). Checked before {@link readCertificate}, which
 * refuses the same certificate as `null`, so that the one refusal honest work
 * can reach is reported as such: see {@link certificateTooLargeRefusal}.
 */
export function certificateTooLarge(
  data: object,
  maxLength: number = MAX_CERTIFICATE_BASE64_LENGTH,
): boolean {
  const value = (data as { readonly mmb?: unknown }).mmb;
  return typeof value === "string" && value.length > maxLength;
}

/** The refusal of an envelope whose certificate is over its cap. */
export function certificateTooLargeRefusal(): AnswerNormalizationResult {
  return {
    diagnostics: [
      diagnostic(
        "certificate_too_large",
        "The certificate is too large to check.",
        ["data", "mmb"],
      ),
    ],
    ok: false,
    reason: "too-large",
  };
}

/**
 * Decode the base64 `mmb` field of an envelope's data. `undefined` when the
 * envelope carries none, `null` when it carries one that is over the cap (the
 * shared one unless a type gives its own) or is not base64. The proof types
 * treat both as malformed; translation accepts the first (an answer typed but
 * never checked) and refuses only the second.
 */
export function readCertificate(
  data: object,
  maxLength: number = MAX_CERTIFICATE_BASE64_LENGTH,
): Uint8Array | null | undefined {
  const value = (data as { readonly mmb?: unknown }).mmb;

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length > maxLength) {
    return null;
  }

  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}
