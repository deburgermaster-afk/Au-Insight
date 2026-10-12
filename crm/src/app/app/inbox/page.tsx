import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Composer } from "@/components/mail/composer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMail } from "@/lib/data";
import { myMailboxes } from "@/lib/mail-actions";
import { Mailbox, type Msg } from "./mailbox";
import { PenSquare } from "lucide-react";

export const metadata = { title: "Inbox" };

async function Box() {
  await connection();
  const [messages, { boxes }] = await Promise.all([listMail(), myMailboxes()]);
  return <Mailbox messages={messages as Msg[]} boxes={boxes} />;
}

export default function InboxPage() {
  return (
    <>
      <PageHeader
        actions={
          <Composer
            trigger={
              <Button size="sm" className="rounded-full">
                <PenSquare /> Compose
              </Button>
            }
          />
        }
      />
      <Suspense fallback={<Skeleton className="-m-3 h-[calc(100dvh-4.25rem)] rounded-none" />}>
        <Box />
      </Suspense>
    </>
  );
}
