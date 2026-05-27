"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, Copy, Loader2, Mail, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  provisionFamilyAction,
  type SuperAdminActionState,
} from "@/lib/actions/superadmin";

export function ProvisionForm({
  emailConfigured,
}: {
  emailConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SuperAdminActionState,
    FormData
  >(provisionFamilyAction, null);
  const formRef = React.useRef<HTMLFormElement>(null);

  // Reset form on success so Bassem can provision another family back-to-back
  // without manually clearing each field. The result card below stays
  // visible until the next submit overwrites `state`.
  React.useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      if (state.emailSent) {
        toast.success(state.message ?? "Family created");
      } else {
        toast.warning(state.message ?? "Family created — email failed");
      }
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  const fieldError = (key: string) =>
    state && !state.ok ? state.fieldErrors?.[key]?.[0] : undefined;

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {!emailConfigured && (
          <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <p>
              <strong>RESEND_API_KEY is not set.</strong> Family + user creation
              still works, but emails won&apos;t send — the generated password
              will appear here for you to copy and share manually. Set
              <code className="mx-1 rounded bg-amber-900/10 px-1">RESEND_API_KEY</code>
              in Vercel to turn on automatic delivery.
            </p>
          </div>
        )}

        <form ref={formRef} action={formAction} className="space-y-4">
          <Field
            id="familyName"
            label="Family name"
            hint="What this family will be called inside the app."
            error={fieldError("familyName")}
          >
            <Input
              id="familyName"
              name="familyName"
              placeholder="The Smith family"
              required
              autoComplete="off"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="adminName"
              label="Admin name"
              error={fieldError("adminName")}
            >
              <Input
                id="adminName"
                name="adminName"
                placeholder="John Smith"
                required
                autoComplete="off"
              />
            </Field>

            <Field
              id="adminEmail"
              label="Admin email"
              hint="They sign in with this address."
              error={fieldError("adminEmail")}
            >
              <Input
                id="adminEmail"
                name="adminEmail"
                type="email"
                placeholder="john@example.com"
                required
                autoComplete="off"
              />
            </Field>
          </div>

          <Field
            id="password"
            label={
              <>
                Password{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (leave blank to auto-generate)
                </span>
              </>
            }
            error={fieldError("password")}
          >
            <Input
              id="password"
              name="password"
              type="text"
              placeholder="auto-generated when blank"
              minLength={8}
              autoComplete="off"
            />
          </Field>

          {state && !state.ok && !state.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              Create family + send credentials
            </Button>
          </div>
        </form>

        {state?.ok && state.generatedPassword && (
          <CredentialsCard
            email={state.adminEmail ?? ""}
            password={state.generatedPassword}
            loginUrl={state.loginUrl ?? ""}
            emailSent={!!state.emailSent}
            emailError={state.emailError}
          />
        )}
      </CardContent>
    </Card>
  );
}

// Credentials reveal panel. Shown ONCE per submission — once Bassem
// navigates away or starts a new submission, this view is gone. The
// password is not stored in plaintext anywhere, so this is genuinely the
// only chance to copy it without regenerating.
export function CredentialsCard({
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
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopiedField(label);
        toast.success(`${label} copied`);
        setTimeout(() => setCopiedField(null), 1500);
      },
      () => toast.error("Copy failed — your browser blocked clipboard access"),
    );
  };

  const block = [
    `Sign in: ${loginUrl}`,
    `Email:    ${email}`,
    `Password: ${password}`,
  ].join("\n");

  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {emailSent ? (
          <>
            <Mail className="h-4 w-4 text-emerald-600" />
            Credentials emailed
          </>
        ) : (
          <>
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Email NOT sent — copy and send manually
          </>
        )}
      </div>

      {!emailSent && emailError && (
        <p className="mb-3 text-xs text-muted-foreground">
          Reason: <span className="font-mono">{emailError}</span>
        </p>
      )}

      <div className="space-y-2">
        <CredRow
          label="Sign-in URL"
          value={loginUrl}
          copied={copiedField === "Sign-in URL"}
          onCopy={() => copy("Sign-in URL", loginUrl)}
        />
        <CredRow
          label="Email"
          value={email}
          copied={copiedField === "Email"}
          onCopy={() => copy("Email", email)}
        />
        <CredRow
          label="Password"
          value={password}
          copied={copiedField === "Password"}
          onCopy={() => copy("Password", password)}
        />
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copy("All credentials", block)}
        >
          {copiedField === "All credentials" ? (
            <Check className="mr-1 h-4 w-4" />
          ) : (
            <Copy className="mr-1 h-4 w-4" />
          )}
          Copy all
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        This password is shown only once. It&apos;s already hashed in the
        database — if you lose it you&apos;ll need to regenerate.
      </p>
    </div>
  );
}

function CredRow({
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
      <span className="w-20 flex-shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? (
          <Check className="h-4 w-4 text-emerald-600" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
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
