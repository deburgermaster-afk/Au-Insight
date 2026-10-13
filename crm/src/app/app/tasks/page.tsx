import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { WithPickers } from "@/components/app/with-pickers";
import { NewTaskDialog } from "@/components/forms/dialogs";
import { listTasks } from "@/lib/data";
import { getEditOptions } from "@/lib/edit-data";
import { getCtx } from "@/lib/session";
import { TaskBoard } from "./task-board";

export const metadata = { title: "Tasks" };

async function Board() {
  await connection();
  const [rows, ctx, options] = await Promise.all([listTasks(), getCtx(), getEditOptions()]);
  const tasks = rows.map((r) => ({
    ...r.task,
    assignee: r.assignee,
    clientName: r.clientFirst ? `${r.clientFirst} ${r.clientLast}` : null,
    matterRef: r.matterRef,
  }));
  return <TaskBoard tasks={tasks} me={ctx.userId} options={options} caps={ctx.caps} />;
}

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks" description="What the team is working on, and what's waiting on clients." actions={<WithPickers render={(p) => <NewTaskDialog pickers={p} />} />} />
      <Suspense fallback={<TableSkeleton />}>
        <Board />
      </Suspense>
    </>
  );
}
