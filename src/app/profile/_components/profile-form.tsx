"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AVATAR_PALETTE, Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateProfileAction,
  type ProfileActionState,
} from "@/lib/actions/profile";

const EMOJI_OPTIONS = [
  "😀", "😎", "🤖", "🦊", "🐱", "🐶", "🐼", "🐧", "🦁", "🦄",
  "🐲", "🌟", "🔥", "⚡️", "🚀", "🎯", "💎", "🎨", "🎮", "📚",
];

export function ProfileForm({
  defaults,
}: {
  defaults: {
    name: string;
    avatarColor: string;
    avatarEmoji: string;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
}) {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(
    updateProfileAction,
    null,
  );
  const [color, setColor] = React.useState(defaults.avatarColor);
  const [emoji, setEmoji] = React.useState(defaults.avatarEmoji);
  const [name, setName] = React.useState(defaults.name);

  React.useEffect(() => {
    if (state?.ok) toast.success(state.message ?? "Saved");
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <form action={action} className="space-y-5">
      {/* Hidden inputs hold the picker selections */}
      <input type="hidden" name="avatarColor" value={color} />
      <input type="hidden" name="avatarEmoji" value={emoji} />

      <div className="flex items-center gap-4">
        <Avatar
          name={name || "?"}
          emoji={emoji || undefined}
          color={color || undefined}
          size="xl"
        />
        <p className="text-xs text-muted-foreground">
          Pick a color and emoji below — they show up next to your name
          everywhere in the app.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Display name</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {fieldError("name") && (
          <p className="text-xs text-destructive">{fieldError("name")}</p>
        )}
      </div>

      <div>
        <Label className="mb-2 block">Color</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setColor("")}
            className={
              "h-8 w-8 rounded-full border-2 text-xs " +
              (color === ""
                ? "border-foreground"
                : "border-transparent opacity-60 hover:opacity-100")
            }
            aria-label="Auto"
            title="Auto"
          >
            auto
          </button>
          {AVATAR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              style={{ backgroundColor: c }}
              className={
                "h-8 w-8 rounded-full border-2 transition-transform " +
                (color === c
                  ? "border-foreground scale-110"
                  : "border-transparent hover:scale-105")
              }
            />
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Emoji (optional)</Label>
        <div className="grid grid-cols-10 gap-1">
          <button
            type="button"
            onClick={() => setEmoji("")}
            className={
              "flex h-9 items-center justify-center rounded-md border text-xs " +
              (emoji === ""
                ? "border-foreground bg-accent"
                : "border-transparent hover:bg-accent")
            }
            title="No emoji"
          >
            —
          </button>
          {EMOJI_OPTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEmoji(e)}
              className={
                "flex h-9 items-center justify-center rounded-md border text-lg " +
                (emoji === e
                  ? "border-foreground bg-accent"
                  : "border-transparent hover:bg-accent")
              }
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="quietHoursStart">Quiet hours start (HH:mm)</Label>
          <Input
            id="quietHoursStart"
            name="quietHoursStart"
            type="time"
            defaultValue={defaults.quietHoursStart}
            placeholder="22:00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quietHoursEnd">Quiet hours end</Label>
          <Input
            id="quietHoursEnd"
            name="quietHoursEnd"
            type="time"
            defaultValue={defaults.quietHoursEnd}
            placeholder="07:00"
          />
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Notifications are muted during this window in your local time.
      </p>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Save profile
      </Button>
    </form>
  );
}
