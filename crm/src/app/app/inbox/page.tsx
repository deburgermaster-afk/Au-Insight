import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { WithPickers } from "@/components/app/with-pickers";
import { ComposeDialog } from "@/components/forms/dialogs";
import { listMessages } from "@/lib/data";
import { getCtx } from "@/lib/session";
import { Mailbox } from "./mailbox";

export const metadata = { title: "Inbox" };

async function Box() {
  const [inbox, sent, archive, ctx] = await Promise.all([listMessages("inbox"), listMessages("sent"), listMessages("archive"), getCtx()]);
  return <Mailbox messages={[...inbox, ...sent, ...archive]} address={ctx.email} />;
}

export default function InboxPage() {
  return (
    <>
      <PageHeader title="Inbox" description="Your mailbox. Messages from clients are filed to their record." actions={<WithPickers render={(p) => <ComposeDialog pickers={p} />} />} />
      <Suspense fallback={<TableSkeleton />}>
        <Box />
      </Suspense>
    </>
  );
}
