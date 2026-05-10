"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Kanban, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type View = "table" | "kanban" | "calendar";

const VIEWS: { value: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "table", label: "Table", icon: Table2 },
  { value: "kanban", label: "Board", icon: Kanban },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
];

export function ViewSwitcher({ active }: { active: View }) {
  const params = useSearchParams();

  return (
    <div className="inline-flex rounded-md border bg-background p-0.5">
      {VIEWS.map(({ value, label, icon: Icon }) => {
        const next = new URLSearchParams(params);
        if (value === "table") next.delete("view");
        else next.set("view", value);
        const href = `/admin/tasks${next.size ? `?${next.toString()}` : ""}`;
        return (
          <Link
            key={value}
            href={href}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
              active === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
