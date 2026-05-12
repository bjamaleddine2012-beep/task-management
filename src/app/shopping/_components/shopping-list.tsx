"use client";

import * as React from "react";
import { useTransition } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addShoppingItemAction,
  clearCheckedShoppingAction,
  deleteShoppingItemAction,
  toggleShoppingItemAction,
} from "@/lib/actions/shopping";
import { cn } from "@/lib/utils";

type UserChip = {
  id: string;
  name: string | null;
  email: string;
  avatarColor: string | null;
  avatarEmoji: string | null;
};

export type ShoppingItemRow = {
  id: string;
  name: string;
  quantity: string | null;
  note: string | null;
  isChecked: boolean;
  addedAtFormatted: string;
  addedBy: UserChip;
  checkedBy: UserChip | null;
};

export function ShoppingList({
  items,
  currentUserId,
  isAdmin,
}: {
  items: ShoppingItemRow[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const unchecked = items.filter((i) => !i.isChecked);
  const checked = items.filter((i) => i.isChecked);

  return (
    <div className="space-y-6">
      <AddForm />

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          To buy · {unchecked.length}
        </h2>
        {unchecked.length === 0 ? (
          <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            List is empty.
          </p>
        ) : (
          <ul className="divide-y rounded-md border bg-background">
            {unchecked.map((i) => (
              <Row
                key={i.id}
                item={i}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
            ))}
          </ul>
        )}
      </section>

      {checked.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Done · {checked.length}
            </h2>
            {isAdmin && <ClearCheckedButton />}
          </div>
          <ul className="divide-y rounded-md border bg-background/60">
            {checked.map((i) => (
              <Row
                key={i.id}
                item={i}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AddForm() {
  const [name, setName] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [pending, startSubmitting] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    startSubmitting(async () => {
      const fd = new FormData();
      fd.set("name", trimmed);
      if (quantity.trim()) fd.set("quantity", quantity.trim());
      const res = await addShoppingItemAction(null, fd);
      if (res?.ok) {
        setName("");
        setQuantity("");
      } else if (res && !res.ok) {
        toast.error(res.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <Input
        placeholder="Milk, bread, …"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={pending}
        className="flex-1"
      />
      <Input
        placeholder="Qty (optional)"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        disabled={pending}
        className="sm:w-32"
      />
      <Button type="submit" disabled={pending || !name.trim()}>
        {pending ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-1 h-4 w-4" />
        )}
        Add
      </Button>
    </form>
  );
}

function Row({
  item,
  currentUserId,
  isAdmin,
}: {
  item: ShoppingItemRow;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [toggling, startToggling] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const canDelete = isAdmin || item.addedBy.id === currentUserId;

  const onToggle = () => {
    startToggling(async () => {
      const fd = new FormData();
      fd.set("id", item.id);
      const res = await toggleShoppingItemAction(null, fd);
      if (res && !res.ok) toast.error(res.error);
    });
  };

  const onDelete = () => {
    startDeleting(async () => {
      const fd = new FormData();
      fd.set("id", item.id);
      const res = await deleteShoppingItemAction(null, fd);
      if (res && !res.ok) toast.error(res.error);
    });
  };

  return (
    <li className="flex items-center gap-3 p-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={toggling}
        aria-label={item.isChecked ? "Uncheck" : "Check"}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors",
          item.isChecked
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-input bg-background hover:border-emerald-500",
        )}
      >
        {toggling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : item.isChecked ? (
          <Check className="h-4 w-4" />
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium",
            item.isChecked && "text-muted-foreground line-through",
          )}
        >
          {item.name}
          {item.quantity && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {item.quantity}
            </span>
          )}
        </p>
        {item.note && (
          <p className="truncate text-xs text-muted-foreground">{item.note}</p>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Avatar
            name={item.addedBy.name ?? item.addedBy.email}
            emoji={item.addedBy.avatarEmoji}
            color={item.addedBy.avatarColor}
            size="sm"
          />
          <span>
            added by {item.addedBy.name ?? item.addedBy.email} · {item.addedAtFormatted}
          </span>
        </div>
        {item.isChecked && item.checkedBy && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <Avatar
              name={item.checkedBy.name ?? item.checkedBy.email}
              emoji={item.checkedBy.avatarEmoji}
              color={item.checkedBy.avatarColor}
              size="sm"
            />
            <span>got it: {item.checkedBy.name ?? item.checkedBy.email}</span>
          </div>
        )}
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Delete"
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </li>
  );
}

function ClearCheckedButton() {
  const [pending, startClearing] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        startClearing(async () => {
          if (!confirm("Clear all checked items?")) return;
          const res = await clearCheckedShoppingAction();
          if (res?.ok) toast.success(res.message ?? "Cleared");
          else if (res && !res.ok) toast.error(res.error);
        })
      }
      disabled={pending}
      className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {pending ? "Clearing…" : "Clear all"}
    </button>
  );
}
