import { type ReactNode, Suspense } from "react";
import type { Pickers } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { getPickers } from "@/lib/data";

async function Load({ render }: { render: (p: Pickers) => ReactNode }) {
  return <>{render(await getPickers())}</>;
}

/** Renders create dialogs that need the agency's clients, staff and employers to pick from. */
export function WithPickers({ render, fallback = "New" }: { render: (p: Pickers) => ReactNode; fallback?: string }) {
  return (
    <Suspense
      fallback={
        <Button size="sm" disabled>
          {fallback}
        </Button>
      }
    >
      <Load render={render} />
    </Suspense>
  );
}
