"use client";

import { Loader2, LogOut } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientSignOut, clientUpdateDetails } from "@/lib/client-actions";

export function DetailsForm({ phone, address, city, state }: { phone: string | null; address: string | null; city: string | null; state: string | null }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2 rounded-xl border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await clientUpdateDetails(f);
          if (r.ok) toast.success("Details updated");
          else toast.error(r.error);
        });
      }}
    >
      <p className="text-xs font-medium">Contact details</p>
      <div className="grid gap-1">
        <Label htmlFor="phone" className="text-[11px] text-muted-foreground">
          Mobile
        </Label>
        <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ""} className="h-9" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="address" className="text-[11px] text-muted-foreground">
          Address
        </Label>
        <Input id="address" name="address" defaultValue={address ?? ""} className="h-9" autoComplete="street-address" />
      </div>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Input name="city" placeholder="City" defaultValue={city ?? ""} className="h-9" aria-label="City" />
        <Input name="state" placeholder="State" defaultValue={state ?? ""} className="h-9" aria-label="State" />
      </div>
      <Button type="submit" size="sm" className="mt-1 justify-self-end rounded-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Save
      </Button>
    </form>
  );
}

export function SignOut() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="h-10 rounded-full text-muted-foreground"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await clientSignOut();
          location.assign("/client/sign-in");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out
    </Button>
  );
}
