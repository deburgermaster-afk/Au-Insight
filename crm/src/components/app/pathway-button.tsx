"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { suggestPathways } from "@/lib/pathway-actions";

const phases = ["Reading the student file…", "Comparing similar students at your agency…", "Mapping visas and timing…", "Matching CRICOS courses…"];

export function SuggestButton({ clientId, again = false }: { clientId: string; again?: boolean }) {
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState(0);
  const router = useRouter();
  useEffect(() => {
    if (!pending) return void setPhase(0);
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, phases.length - 1)), 3500);
    return () => clearInterval(t);
  }, [pending]);
  const run = () =>
    start(async () => {
      const r = await suggestPathways(clientId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.id === "rules" ? "Pathways estimated with the rules engine (AI unavailable)" : "Pathways suggested by AI");
      router.refresh();
    });
  if (again)
    return (
      <Button size="icon-xs" variant="ghost" onClick={run} disabled={pending} aria-label="Suggest again" title={pending ? phases[phase] : "Suggest again"}>
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      </Button>
    );
  return (
    <Button onClick={run} disabled={pending} className="h-9 w-full rounded-full">
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {pending ? phases[phase] : "Suggest pathways"}
    </Button>
  );
}
