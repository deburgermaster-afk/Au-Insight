"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { sectionBySlug } from "@/lib/settings-sections";
import { nav } from "./nav";

const titles = Object.fromEntries(nav.flatMap((g) => g.items.map((i) => [i.href, i.title])));

function Trail() {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean).slice(1);
  const section = parts[0] ? `/app/${parts[0]}` : "/app";
  const leaf = parts[2] === "lodge" ? "Lodgement pack" : parts[1] ? (parts[1] === "new" ? "New" : parts[0] === "visas" ? `Subclass ${decodeURIComponent(parts[1])}` : parts[0] === "settings" ? (sectionBySlug(parts[1])?.title ?? "Details") : "Details") : null;
  return (
    <>
      <ChevronRight className="size-3.5 text-muted-foreground/50" />
      {leaf ? (
        <>
          <Link href={section} className="hover:text-foreground">
            {titles[section] ?? parts[0]}
          </Link>
          <ChevronRight className="size-3.5 text-muted-foreground/50" />
          <span className="truncate text-foreground">{leaf}</span>
        </>
      ) : (
        <span className="truncate text-foreground">{titles[section] ?? "Dashboard"}</span>
      )}
    </>
  );
}

/** Lodgely › Section › Page */
export function Crumbs({ agency }: { agency: React.ReactNode }) {
  return (
    <nav className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      <Link href="/app" className="hidden truncate hover:text-foreground sm:block">
        {agency}
      </Link>
      <Suspense>
        <Trail />
      </Suspense>
    </nav>
  );
}
