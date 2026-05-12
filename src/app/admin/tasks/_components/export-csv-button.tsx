"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportTasksCsvAction } from "@/lib/actions/tasks";

export function ExportCsvButton() {
  const [pending, setPending] = React.useState(false);

  const onClick = async () => {
    setPending(true);
    try {
      const r = await exportTasksCsvAction();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Trigger download from a Blob URL.
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Tasks exported");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-1 h-4 w-4" />
      )}
      Export CSV
    </Button>
  );
}
