"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Mail,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { FamilyRole } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  provisionFamilyAction,
  type CredentialRow,
  type SuperAdminActionState,
} from "@/lib/actions/superadmin";

// Local shape for one member row in the form. `role` stored as the
// FamilyRole literal so we can pass it straight into the action's
// JSON.parse path without translation.
type MemberDraft = {
  // Stable client id so React's key stays consistent across re-renders
  // when rows are inserted/deleted in the middle of the list.
  uid: string;
  name: string;
  email: string;
  role: FamilyRole;
  password: string;
};

function emptyMember(role: FamilyRole = "MEMBER"): MemberDraft {
  return {
    uid: Math.random().toString(36).slice(2),
    name: "",
    email: "",
    role,
    password: "",
  };
}

export function ProvisionForm({
  emailConfigured,
}: {
  emailConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SuperAdminActionState,
    FormData
  >(provisionFamilyAction, null);

  // Start with one ADMIN row — every family needs at least one. Bassem
  // can change its role later but the form refuses to submit without
  // an ADMIN somewhere.
  const [members, setMembers] = React.useState<MemberDraft[]>(() => [
    emptyMember("ADMIN"),
  ]);
  const [familyName, setFamilyName] = React.useState("");

  // After a successful submit, clear the form so Bassem can chain
  // multiple provisions back-to-back. The result card (with the
  // generated passwords) stays mounted until the next submit.
  React.useEffect(() => {
    if (state?.ok) {
      setFamilyName("");
      setMembers([emptyMember("ADMIN")]);
      const allSent = state.credentials?.every((c) => c.emailSent) ?? false;
      if (allSent) toast.success(state.message ?? "Family created");
      else toast.warning(state.message ?? "Family created — some emails failed");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  const addMember = () => setMembers((prev) => [...prev, emptyMember("MEMBER")]);
  const removeMember = (uid: string) =>
    setMembers((prev) =>
      prev.length <= 1 ? prev : prev.filter((m) => m.uid !== uid),
    );
  const updateMember = (uid: string, patch: Partial<MemberDraft>) =>
    setMembers((prev) =>
      prev.map((m) => (m.uid === uid ? { ...m, ...patch } : m)),
    );

  const hasAdmin = members.some((m) => m.role === "ADMIN");

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {!emailConfigured && (
          <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <p>
              <strong>RESEND_API_KEY is not set.</strong> Provisioning works,
              but passwords won&apos;t be emailed — they&apos;ll appear in a
              copy box for you to forward manually. Set
              <code className="mx-1 rounded bg-amber-900/10 px-1">RESEND_API_KEY</code>
              in Vercel to enable delivery.
            </p>
          </div>
        )}

        <form action={formAction} className="space-y-5">
          {/* Hidden serialized member list — easier than parsing
              indexed FormData keys server-side. */}
          <input
            type="hidden"
            name="members"
            value={JSON.stringify(
              members.map(({ name, email, role, password }) => ({
                name,
                email,
                role,
                password,
              })),
            )}
          />

          <Field
            id="familyName"
            label="Family name"
            hint="What the family is called inside the app."
            error={fieldError("familyName")}
          >
            <Input
              id="familyName"
              name="familyName"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="The Smith family"
              required
              autoComplete="off"
            />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm">
                Members ·{" "}
                <span className="font-normal text-muted-foreground">
                  {members.length}
                </span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMember}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add member
              </Button>
            </div>

            <div className="space-y-3">
              {members.map((m, idx) => (
                <MemberRow
                  key={m.uid}
                  member={m}
                  index={idx}
                  canRemove={members.length > 1}
                  onRemove={() => removeMember(m.uid)}
                  onChange={(patch) => updateMember(m.uid, patch)}
                  emailError={fieldError(`members.${idx}.email`)}
                  nameError={fieldError(`members.${idx}.name`)}
                />
              ))}
            </div>

            {!hasAdmin && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                Mark at least one member as ADMIN.
              </p>
            )}
            {fieldError("members") && (
              <p className="mt-2 text-xs text-destructive">
                {fieldError("members")}
              </p>
            )}
          </div>

          {state && !state.ok && !state.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <div>
            <Button type="submit" disabled={pending || !hasAdmin}>
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              Create family + send credentials
            </Button>
          </div>
        </form>

        {state?.ok && state.credentials && state.credentials.length > 0 && (
          <CredentialsList
            credentials={state.credentials}
            loginUrl={state.loginUrl ?? ""}
          />
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({
  member,
  index,
  canRemove,
  onRemove,
  onChange,
  nameError,
  emailError,
}: {
  member: MemberDraft;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<MemberDraft>) => void;
  nameError?: string;
  emailError?: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Member {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove member"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_1.4fr_0.7fr]">
        <div>
          <Input
            value={member.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Name"
            required
            autoComplete="off"
            aria-label={`Member ${index + 1} name`}
          />
          {nameError && (
            <p className="mt-1 text-xs text-destructive">{nameError}</p>
          )}
        </div>
        <div>
          <Input
            type="email"
            value={member.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="email@example.com"
            required
            autoComplete="off"
            aria-label={`Member ${index + 1} email`}
          />
          {emailError && (
            <p className="mt-1 text-xs text-destructive">{emailError}</p>
          )}
        </div>
        <Select
          value={member.role}
          onValueChange={(v) => onChange({ role: v as FamilyRole })}
        >
          <SelectTrigger aria-label={`Member ${index + 1} role`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="MEMBER">Member</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Set custom password (optional)
        </summary>
        <Input
          className="mt-2"
          value={member.password}
          onChange={(e) => onChange({ password: e.target.value })}
          placeholder="auto-generated when blank"
          minLength={8}
          autoComplete="off"
          aria-label={`Member ${index + 1} password override`}
        />
      </details>
    </div>
  );
}

// ─── Credentials display (one card per provisioned member) ────────────────

export function CredentialsList({
  credentials,
  loginUrl,
}: {
  credentials: CredentialRow[];
  loginUrl: string;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);

  const copy = (id: string, value: string) => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(id);
        toast.success("Copied");
        setTimeout(() => setCopied(null), 1500);
      },
      () => toast.error("Copy failed"),
    );
  };

  // "Copy all" produces a single block with each member's creds —
  // convenient when Bassem wants to paste into one chat or document.
  const allBlock = [
    `Sign-in URL: ${loginUrl}`,
    "",
    ...credentials.flatMap((c) => [
      `— ${c.name} (${c.role})`,
      `Email:    ${c.email}`,
      `Password: ${c.password}`,
      "",
    ]),
  ].join("\n");

  const anyFailed = credentials.some((c) => !c.emailSent);

  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {anyFailed ? (
            <>
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Some emails failed — copy and send manually
            </>
          ) : (
            <>
              <Mail className="h-4 w-4 text-emerald-600" />
              Credentials emailed to {credentials.length} member
              {credentials.length === 1 ? "" : "s"}
            </>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copy("__all__", allBlock)}
        >
          {copied === "__all__" ? (
            <Check className="mr-1 h-4 w-4" />
          ) : (
            <Copy className="mr-1 h-4 w-4" />
          )}
          Copy all
        </Button>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Sign-in URL:{" "}
        <code className="rounded bg-background px-1.5 py-0.5">{loginUrl}</code>
      </p>

      <ul className="space-y-2">
        {credentials.map((c) => (
          <li key={c.email} className="rounded border bg-background p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{c.name}</span>
                <Badge variant={c.role === "ADMIN" ? "default" : "secondary"} className="text-[10px]">
                  {c.role}
                </Badge>
                {c.emailSent ? (
                  <Badge variant="outline" className="text-[10px] text-emerald-700">
                    sent
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-amber-700">
                    not sent
                  </Badge>
                )}
              </div>
            </div>
            {!c.emailSent && c.emailError && (
              <p className="mb-2 text-xs text-muted-foreground">
                {c.emailError}
              </p>
            )}
            <div className="space-y-1.5 font-mono text-xs">
              <CopyableField
                label="Email"
                value={c.email}
                copied={copied === `${c.email}:email`}
                onCopy={() => copy(`${c.email}:email`, c.email)}
              />
              <CopyableField
                label="Password"
                value={c.password}
                copied={copied === `${c.email}:pw`}
                onCopy={() => copy(`${c.email}:pw`, c.password)}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        Passwords are shown only once. They&apos;re already hashed in the
        database — if you lose one, regenerate it from the family list below.
      </p>
    </div>
  );
}

function CopyableField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-0.5">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// Single-credential card — used by the families-list "reset & resend"
// path, which only handles one user at a time.
export function SingleCredentialCard({
  email,
  password,
  loginUrl,
  emailSent,
  emailError,
}: {
  email: string;
  password: string;
  loginUrl: string;
  emailSent: boolean;
  emailError?: string;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const copy = (id: string, value: string) => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(id);
        toast.success(`${id} copied`);
        setTimeout(() => setCopied(null), 1500);
      },
      () => toast.error("Copy failed"),
    );
  };
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {emailSent ? (
          <>
            <Mail className="h-4 w-4 text-emerald-600" />
            New password emailed
          </>
        ) : (
          <>
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Email failed — copy manually
          </>
        )}
      </div>
      {!emailSent && emailError && (
        <p className="mb-2 text-xs text-muted-foreground">{emailError}</p>
      )}
      <div className="space-y-1.5 font-mono text-xs">
        <CopyableField
          label="URL"
          value={loginUrl}
          copied={copied === "URL"}
          onCopy={() => copy("URL", loginUrl)}
        />
        <CopyableField
          label="Email"
          value={email}
          copied={copied === "Email"}
          onCopy={() => copy("Email", email)}
        />
        <CopyableField
          label="Password"
          value={password}
          copied={copied === "Password"}
          onCopy={() => copy("Password", password)}
        />
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
