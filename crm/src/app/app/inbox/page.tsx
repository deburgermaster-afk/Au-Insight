import { revalidateTag } from "next/cache";
import { after, connection } from "next/server";
import { MailAccounts } from "@/components/mail/accounts";
import { myConnections } from "@/lib/connection-actions";
import { agencyTag } from "@/lib/data";
import { providerReady, syncStale } from "@/lib/mail-connect";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
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
  const [messages, { boxes, agencyId }, connections] = await Promise.all([listMail(), myMailboxes(), myConnections()]);
  // Opening the inbox pulls new Gmail/Outlook mail in the background (at most every 3 minutes).
  if (connections.length)
    after(async () => {
      const r = await syncStale(3, agencyId).catch(() => ({ added: 0 }));
      if (r.added) revalidateTag(agencyTag(agencyId), { expire: 0 });
    });
  return <Mailbox messages={messages as Msg[]} boxes={boxes} accounts={<MailAccounts connections={connections} ready={{ google: providerReady("google"), microsoft: providerReady("microsoft") }} />} />;
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
        <Guard cap="mail"><Box /></Guard>
      </Suspense>
    </>
  );
}
