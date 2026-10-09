import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/forms";

export default function Page() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
