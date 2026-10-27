import type { AboutPage } from "../domain/site-settings";
import type { AppStores } from "./stores";

/** Long enough for an Impressum and a privacy notice together, with room over. */
export const ABOUT_PAGE_MAX_LENGTH = 100_000;

/** The instance's About text, for anyone: the page is public by design. */
export async function readAboutPage(
  stores: AppStores,
): Promise<AboutPage | null> {
  return (await stores.siteSettings.read()).about;
}
