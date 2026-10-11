import { SignUpForm } from "../sign-up/sign-up-form";

export const metadata = { title: "Create your agency" };

export default function OnboardingPage() {
  return <SignUpForm existingUser />;
}
