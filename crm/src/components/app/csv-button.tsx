"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/segments";

/** Download the rows behind a report as a CSV file. */
export function CsvButton({ name, rows, columns }: { name: string; rows: Record<string, unknown>[]; columns: { key: string; label: string }[] }) {
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={!rows.length}
      onClick={() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + toCsv(rows, columns)], { type: "text/csv;charset=utf-8" }));
        a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      }}
    >
      <Download /> CSV
    </Button>
  );
}
