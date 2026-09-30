/**
 * What a language offers, as opposed to what a formula says: the names an
 * exercise may hand out to objects or to a tree's new instances.
 *
 * DOM-free and free of i18n, like the rest of the kit's formula code.
 */

import type { SurfaceLanguage } from "@aufbau/syntax";

/**
 * The names the language offers: the tokens of every sort no quantifier
 * binds that reaches the individual sort, in the order the language lists
 * them. For the example blocks language that is `a`–`f`, and for forallx:
 * UBC `a`–`w` and then `a1`–`w9`. The world editor's names menu lists these,
 * and a truth tree draws its new names from them.
 */
export function languageNames(lang: SurfaceLanguage): readonly string[] {
  const names: string[] = [];

  for (const info of lang.spec.sorts.values()) {
    if (lang.bindableSorts.has(info.name)) {
      continue;
    }

    const reaches = info.roles.includes("individual")
      ? true
      : [...lang.spec.sorts.values()].some(
          (target) =>
            target.roles.includes("individual") &&
            lang.coerce(info.name, target.name) !== null,
        );

    if (reaches) {
      names.push(...info.vars);
    }
  }

  return names;
}
