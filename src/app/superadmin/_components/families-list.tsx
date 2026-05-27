"use client";

import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export type FamilyRow = {
  id: string;
  name: string;
  createdAtFormatted: string;
  memberCount: number;
  taskCount: number;
  adminUserId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  // True for the row matching the super-admin's own activeFamilyId.
  isMyActiveFamily: boolean;
};

// Families overview: a navigational list. Each row links to
// /superadmin/[familyId] for the full edit + delete + add-member UI.
// Keeping the list itself dumb means we don't have to thread N action
// states + dialogs across N families.

export function FamiliesList({ families }: { families: FamilyRow[] }) {
  if (families.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No families yet. Create the first one above.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y">
          {families.map((f) => (
            <li key={f.id}>
              <Link
                href={`/superadmin/${f.id}`}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-medium">{f.name}</p>
                    {f.isMyActiveFamily && (
                      <Badge variant="outline" className="text-[10px]">
                        your active family
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      <Users className="mr-1 h-3 w-3" />
                      {f.memberCount}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {f.taskCount} tasks
                    </Badge>
                  </div>

                  {f.adminEmail ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Admin: <span className="font-medium">{f.adminName ?? "—"}</span>
                      {" · "}
                      {f.adminEmail}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      No admin yet
                    </p>
                  )}

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Created {f.createdAtFormatted}
                  </p>
                </div>

                <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
