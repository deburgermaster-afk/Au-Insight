import { Suspense } from "react";
import { TwoFactorForm } from "./two-factor-form";

export const metadata = { title: "Two-factor sign-in" };

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorForm />
    </Suspense>
  );
}
