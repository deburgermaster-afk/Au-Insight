import { Suspense } from "react";
import { VerifyForm } from "@/components/auth/forms";

export default function Page() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
