"use client";

import { useEffect, useState } from "react";

interface NavItem {
  id: string;
  label: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface DocsSidebarProps {
  sections: NavSection[];
}

/**
 * DocsSidebar — sticky left nav with scroll-spy. Highlights the section
 * currently in view as the user scrolls the page.
 */
export function DocsSidebar({ sections }: DocsSidebarProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const ids = sections.flatMap((s) => s.items.map((i) => i.id));
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost entry that's intersecting
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h4 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {section.title}
          </h4>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                    activeId === item.id
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
