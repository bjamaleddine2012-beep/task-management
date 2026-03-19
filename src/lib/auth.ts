import { adminAuth } from "./firebase-admin";
import { NextRequest } from "next/server";

export async function verifyAuthToken(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split("Bearer ")[1];
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}
