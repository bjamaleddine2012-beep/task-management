"use client";

import * as React from "react";
import { useTransition } from "react";
import { Loader2, Send, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import {
  addCommentAction,
  deleteCommentAction,
  toggleReactionAction,
} from "@/lib/actions/profile";
import { cn } from "@/lib/utils";

const REACTION_EMOJI = ["👍", "❤️", "🎉", "🔥", "🚀", "🤔"] as const;

export type CommentReaction = {
  emoji: string;
  userId: string;
};

export type CommentItem = {
  id: string;
  body: string;
  createdAtFormatted: string;
  reactions: CommentReaction[];
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
          <CommentRow
            key={c.id}
            comment={c}
            currentUserId={currentUserId}
            canDelete={canDelete(c.user.id)}
          />
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

function CommentRow({
  comment,
  currentUserId,
  canDelete,
}: {
  comment: CommentItem;
  currentUserId: string;
  canDelete: boolean;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pending, startReacting] = useTransition();

  // Group reactions by emoji and capture whether the current user reacted.
  const grouped = React.useMemo(() => {
    const m = new Map<string, { count: number; mine: boolean }>();
    for (const r of comment.reactions) {
      const cur = m.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.userId === currentUserId) cur.mine = true;
      m.set(r.emoji, cur);
    }
    return Array.from(m.entries());
  }, [comment.reactions, currentUserId]);

  const toggle = (emoji: string) => {
    startReacting(async () => {
      const fd = new FormData();
      fd.set("commentId", comment.id);
      fd.set("emoji", emoji);
      const res = await toggleReactionAction(null, fd);
      if (res && !res.ok) toast.error(res.error);
      setPickerOpen(false);
    });
  };

  return (
    <li className="flex items-start gap-2 rounded-md border bg-background p-2.5">
      <Avatar
        name={comment.user.name ?? comment.user.email}
        emoji={comment.user.avatarEmoji}
        color={comment.user.avatarColor}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">
            {comment.user.name ?? comment.user.email}
          </span>
          {comment.user.isAdmin && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
              admin
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {comment.createdAtFormatted}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm">
          <BodyWithMentions text={comment.body} />
        </p>

        {(grouped.length > 0 || pickerOpen) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {grouped.map(([emoji, { count, mine }]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => toggle(emoji)}
                disabled={pending}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  mine
                    ? "border-primary bg-primary/10"
                    : "border-input bg-background hover:bg-accent",
                )}
              >
                <span>{emoji}</span>
                <span className="tabular-nums text-muted-foreground">
                  {count}
                </span>
              </button>
            ))}
            {pickerOpen &&
              REACTION_EMOJI.filter(
                (e) => !grouped.some(([emoji]) => emoji === e),
              ).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => toggle(emoji)}
                  disabled={pending}
                  className="rounded-full border border-dashed border-input bg-background px-2 py-0.5 text-xs hover:bg-accent"
                >
                  {emoji}
                </button>
              ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="React"
        title="React"
      >
        <SmilePlus className="h-3.5 w-3.5" />
      </button>
      {canDelete && <DeleteButton id={comment.id} />}
    </li>
  );
}

// Renders @name mentions in a distinct color. Lightweight — no
// click-to-profile yet.
function BodyWithMentions({ text }: { text: string }) {
  const parts = text.split(/(@[A-Za-z0-9_.-]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="font-medium text-primary">
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
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
