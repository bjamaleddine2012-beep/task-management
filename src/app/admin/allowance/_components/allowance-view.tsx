"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { DollarSign, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addAllowanceAction,
  deleteAllowanceAction,
  type AllowanceActionState,
} from "@/lib/actions/allowance";

export type AllowanceEntryRow = {
  id: string;
  amount: string;
  amountCents: number;
  reason: string;
  createdAtFormatted: string;
  createdByName: string;
};

export type AllowanceUser = {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarEmoji: string | null;
  balance: string;
  balanceCents: number;
  entries: AllowanceEntryRow[];
};

export function AllowanceView({ users }: { users: AllowanceUser[] }) {
  const [adding, setAdding] = React.useState<AllowanceUser | null>(null);
  const [paying, setPaying] = React.useState<AllowanceUser | null>(null);

  return (
    <div className="space-y-4">
      {users.map((u) => (
        <Card key={u.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div className="flex items-center gap-3">
              <Avatar
                name={u.name}
                color={u.avatarColor}
                emoji={u.avatarEmoji}
                size="lg"
              />
              <div>
                <CardDescription>{u.name}</CardDescription>
                <CardTitle
                  className={
                    u.balanceCents > 0
                      ? "text-3xl text-emerald-600 dark:text-emerald-400"
                      : u.balanceCents < 0
                        ? "text-3xl text-destructive"
                        : "text-3xl"
                  }
                >
                  {u.balance}
                </CardTitle>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="sm" onClick={() => setAdding(u)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPaying(u)}
                disabled={u.balanceCents <= 0}
              >
                <DollarSign className="mr-1 h-3.5 w-3.5" />
                Pay out
              </Button>
            </div>
          </CardHeader>
          {u.entries.length > 0 && (
            <CardContent className="pt-0">
              <ul className="divide-y text-sm">
                {u.entries.map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      ))}

      <AddEntryDialog
        user={adding}
        mode="earn"
        onClose={() => setAdding(null)}
      />
      <AddEntryDialog
        user={paying}
        mode="pay"
        onClose={() => setPaying(null)}
      />
    </div>
  );
}

function EntryRow({ entry }: { entry: AllowanceEntryRow }) {
  const [deleting, startDeleting] = useTransition();
  const positive = entry.amountCents > 0;
  return (
    <li className="flex items-center justify-between py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate">{entry.reason}</p>
        <p className="text-xs text-muted-foreground">
          {entry.createdAtFormatted} · by {entry.createdByName}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={
            "tabular-nums font-medium " +
            (positive ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")
          }
        >
          {positive ? "+" : ""}
          {entry.amount}
        </span>
        <button
          type="button"
          onClick={() =>
            startDeleting(async () => {
              if (!confirm("Delete this entry?")) return;
              const fd = new FormData();
              fd.set("id", entry.id);
              const res = await deleteAllowanceAction(null, fd);
              if (res && !res.ok) toast.error(res.error);
            })
          }
          disabled={deleting}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          aria-label="Delete"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </li>
  );
}

function AddEntryDialog({
  user,
  mode,
  onClose,
}: {
  user: AllowanceUser | null;
  mode: "earn" | "pay";
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<AllowanceActionState, FormData>(
    addAllowanceAction,
    null,
  );

  React.useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Saved");
      onClose();
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, onClose]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "earn" ? "Add to allowance" : "Pay out allowance"}
          </DialogTitle>
          <DialogDescription>
            {user?.name} ·{" "}
            {mode === "pay"
              ? "Records a payout. Enter a positive amount; it'll be deducted from the balance."
              : "Credit toward this user's allowance balance."}
          </DialogDescription>
        </DialogHeader>

        {user && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="userId" value={user.id} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="amountDollars">Amount ($)</Label>
                <Input
                  id="amountDollars"
                  name="amountDollars"
                  type="text"
                  inputMode="decimal"
                  placeholder={mode === "earn" ? "2.50" : "10"}
                  required
                  // For "Pay out", we prefix a minus on submit via hidden
                  // logic — simpler: ask the user to enter positive, then
                  // adjust in the action. We do it client-side here.
                  data-mode={mode}
                />
                {fieldError("amountDollars") && (
                  <p className="text-xs text-destructive">
                    {fieldError("amountDollars")}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  name="reason"
                  placeholder={
                    mode === "earn" ? "Folded the laundry" : "Friday payout"
                  }
                  required
                />
                {fieldError("reason") && (
                  <p className="text-xs text-destructive">
                    {fieldError("reason")}
                  </p>
                )}
              </div>
            </div>

            {state && !state.ok && !state.fieldErrors && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending}
                onClick={(e) => {
                  // For "Pay out" mode: flip the entered positive value
                  // to negative before the form submits.
                  if (mode !== "pay") return;
                  const form = (e.currentTarget as HTMLButtonElement).form;
                  const input = form?.elements.namedItem(
                    "amountDollars",
                  ) as HTMLInputElement | null;
                  if (input?.value && !input.value.startsWith("-")) {
                    input.value = "-" + input.value;
                  }
                }}
              >
                {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {mode === "earn" ? "Add to balance" : "Record payout"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
