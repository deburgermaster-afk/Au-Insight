import { PageSkeleton } from "@/components/app/skeletons";

// Shown instantly while a page's server work runs, so a click never feels stuck.
export default function Loading() {
  return <PageSkeleton />;
}
