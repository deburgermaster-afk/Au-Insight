import { Globe, Puzzle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const box = "grid shrink-0 place-items-center rounded-xl font-bold";
const sizes = { sm: "size-7 text-[12px] rounded-lg", md: "size-10 text-[15px]", lg: "size-12 text-lg" };
type Size = keyof typeof sizes;

/** Small brand-coloured marks for connector tiles (no third-party logo files). */
export function Mark({ kind, size = "md", className }: { kind: string; size?: Size; className?: string }) {
  const s = cn(box, sizes[size], className);
  switch (kind) {
    case "resend":
      return <span className={cn(s, "bg-black text-white ring-1 ring-white/15 dark:bg-white dark:text-black")}>R</span>;
    case "google":
      return (
        <span className={cn(s, "bg-white ring-1 ring-black/10")}>
          <span className="bg-[conic-gradient(from_200deg,#ea4335_0_25%,#fbbc05_0_50%,#34a853_0_75%,#4285f4_0)] bg-clip-text text-transparent">G</span>
        </span>
      );
    case "microsoft":
      return <span className={cn(s, "bg-[#0a64d6] text-white")}>O</span>;
    case "domain":
      return (
        <span className={cn(s, "bg-emerald-500/15 text-emerald-500")}>
          <Globe className="size-1/2" />
        </span>
      );
    case "immi":
      return (
        <span className={cn(s, "bg-sky-500/15 text-sky-500")}>
          <Puzzle className="size-1/2" />
        </span>
      );
    case "xkiro":
      return (
        <span className={cn(s, "bg-gradient-to-br from-orange-400 to-fuchsia-500 text-white")}>
          <Sparkles className="size-1/2" />
        </span>
      );
    default:
      return <span className={cn(s, "bg-muted text-muted-foreground")}>{kind[0]?.toUpperCase()}</span>;
  }
}
