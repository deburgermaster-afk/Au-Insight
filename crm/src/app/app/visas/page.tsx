import { PageHeader } from "@/components/app/page-header";
import { visas } from "@/lib/visas";
import { VisaLibrary } from "./library";

export const metadata = { title: "Visa library" };

export default function VisasPage() {
  return (
    <>
      <PageHeader title="Visa library" description={`${visas.length} visas and services with requirements and document checklists. Always confirm against Home Affairs before lodging.`} />
      <VisaLibrary visas={visas} />
    </>
  );
}
