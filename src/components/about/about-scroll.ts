export const ABOUT_SECTION_IDS = [
  "hero",
  "how-it-works",
  "evidence-trail",
  "for-professionals",
  "for-organizations",
  "about",
] as const;

export function scrollToAboutSection(href: string, onDone?: () => void) {
  const id = href.replace("#", "");
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
    onDone?.();
  }
}
