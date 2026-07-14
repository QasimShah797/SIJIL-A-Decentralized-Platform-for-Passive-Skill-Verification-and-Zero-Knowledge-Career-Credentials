import { useEffect, useState } from "react";

export const LANDING_SECTION_IDS = [
  "home",
  "how-it-works",
  "evidence",
  "wallet",
  "for-recruiters",
] as const;

export type LandingSectionId = (typeof LANDING_SECTION_IDS)[number];

export function useActiveSection(sectionIds: readonly string[] = LANDING_SECTION_IDS) {
  const [activeId, setActiveId] = useState<string>(sectionIds[0]);

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-18% 0px -55% 0px",
        threshold: [0, 0.12, 0.3, 0.5],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds]);

  return activeId;
}

export function scrollToSection(href: string, onDone?: () => void) {
  const id = href.replace("#", "");
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
    onDone?.();
  }
}
