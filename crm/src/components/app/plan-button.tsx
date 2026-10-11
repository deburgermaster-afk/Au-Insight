"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Paid plans open after the beta; until then the button explains that instead of doing nothing. */
export function PlanButton({ label }: { label: string }) {
  return (
    <Button className="mt-5 w-full" onClick={() => toast("Everything is unlocked during the beta", { description: "Paid plans open when billing launches. You won't lose anything." })}>
      {label}
    </Button>
  );
}
