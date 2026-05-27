"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "@/lib/actions/family";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startAccepting] = useTransition();

  return (
    <Button
      className="w-full"
      disabled={pending}
      onClick={() =>
        startAccepting(async () => {
          const fd = new FormData();
          fd.set("token", token);
          const res = await acceptInviteAction(null, fd);
          if (res?.ok) {
            toast.success(res.message ?? "Joined");
            router.refresh();
            router.push("/");
          } else if (res && !res.ok) {
            toast.error(res.error);
          }
        })
      }
    >
      {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
      Accept invite
    </Button>
  );
}
