"use client";

import { BadgeCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const freemail = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "bigpond.com", "aol.com"]);

export type Auth = { spf?: string; dkim?: string; dmarc?: string; verified: boolean } | null;

/** The sender's brand icon (from their domain) with a verified tick, or their initials. */
export function SenderLogo({ address, name, auth, size = "md" }: { address: string; name?: string | null; auth?: Auth; size?: "sm" | "md" }) {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  const [failed, setFailed] = useState(freemail.has(domain) || !domain);
  const px = size === "sm" ? "size-9" : "size-10";
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full border bg-muted text-xs font-semibold", px)}>
      {failed ? (
        initials(name || address)
      ) : (
        // biome-ignore lint/performance/noImgElement: tiny remote favicon
        <img src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt="" className="size-5" onError={() => setFailed(true)} loading="lazy" />
      )}
      {auth?.verified ? (
        <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-background">
          <BadgeCheck className="size-3.5 fill-sky-500 text-background" />
        </span>
      ) : null}
    </span>
  );
}

const result = (v?: string) => (v === "pass" ? "text-emerald-500" : v ? "text-rose-500" : "text-muted-foreground");

/** "Verified sender" chip with the SPF / DKIM / DMARC breakdown. */
export function AuthBadge({ auth, domain }: { auth: Auth; domain: string }) {
  if (!auth) return null;
  const v = auth.verified;
  const Icon = v ? BadgeCheck : auth.spf || auth.dkim ? ShieldAlert : ShieldQuestion;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium", v ? "bg-sky-500/12 text-sky-600 dark:text-sky-300" : "bg-amber-500/12 text-amber-600 dark:text-amber-300")}>
          <Icon className="size-3.5" /> {v ? "Verified sender" : "Unverified sender"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-[13px]">
        <p className="font-medium">{v ? `This email really came from ${domain}` : `We couldn't confirm this came from ${domain}`}</p>
        <p className="mt-1 text-xs text-muted-foreground">{v ? "The sending domain signed it and passed its own policy." : "Treat links and attachments with care, and confirm requests for money or documents by phone."}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          {(["spf", "dkim", "dmarc"] as const).map((k) => (
            <div key={k} className="rounded-md border p-2">
              <dt className="uppercase text-muted-foreground">{k}</dt>
              <dd className={cn("mt-0.5 font-semibold", result(auth[k]))}>{auth[k] ?? "none"}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
