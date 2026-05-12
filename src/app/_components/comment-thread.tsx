"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import {
  addCommentAction,
  deleteCommentAction,
} from "@/lib/actions/profile";

export type CommentItem = {
  id: string;
  body: string;
  createdAtFormatted: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarColor: string | null;
    avatarEmoji: string | null;
    isAdmin: boolean;
  };
};

export function CommentThread({
  taskId,
  comments,
  currentUserId,
  isCurrentUserAdmin,
}: {
  taskId: string;
  comments: CommentItem[];
  currentUserId: string;
  isCurrentUserAdmin: boolean;
}) {
  const [body, setBody] = React.useState("");
  const [posting, startPosting] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    startPosting(async () => {
      const fd = new FormData();
      fd.set("taskId", taskId);
      fd.set("body", trimmed);
      const res = await addCommentAction(null, fd);
      if (res?.ok) {
        setBody("");
      } else if (res && !res.ok) {
        toast.error(res.error);
      }
    });
  };

  const canDelete = (commentUserId: string) =>
    commentUserId === currentUserId || isCurrentUserAdmin;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Comments
      </h3>

      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No comments yet — start the conversation.
        </p>
      )}

      <ul className="space-y-2">
        {comments.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-2 rounded-md border bg-background p-2.5"
          >
            <Avatar
              name={c.user.name ?? c.user.email}
              emoji={c.user.avatarEmoji}
              color={c.user.avatarColor}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">
                  {c.user.name ?? c.user.email}
                </span>
                {c.user.isAdmin && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                    admin
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {c.createdAtFormatted}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
            {canDelete(c.user.id) && <DeleteButton id={c.id} />}
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          disabled={posting}
          className="flex w-full flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" disabled={posting || !body.trim()}>
          {posting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [deleting, startDeleting] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        startDeleting(async () => {
          const fd = new FormData();
          fd.set("id", id);
          const res = await deleteCommentAction(null, fd);
          if (res && !res.ok) toast.error(res.error);
        });
      }}
      disabled={deleting}
      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      aria-label="Delete comment"
    >
      {deleting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
