"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error: string } | null;

export async function loginWithCredentials(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const callbackUrl = (formData.get("callbackUrl") as string) || "/";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: callbackUrl,
    });
    // signIn redirects on success — this line only runs on misconfiguration.
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Invalid email or password." };
      }
      return { error: "Sign-in failed. Please try again." };
    }
    // NEXT_REDIRECT (and other internal control-flow errors) must bubble.
    throw error;
  }
}
