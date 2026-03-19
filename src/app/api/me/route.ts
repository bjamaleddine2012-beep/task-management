import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { UserProfile } from "@/lib/types";

export async function GET(request: NextRequest) {
  const decoded = await verifyAuthToken(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRef = adminDb.collection("users").doc(decoded.uid);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    await userRef.update({ lastLoginAt: new Date().toISOString() });
    return NextResponse.json({ uid: decoded.uid, ...userDoc.data() });
  }

  // First-time login — check if any users exist to determine role
  const usersSnapshot = await adminDb.collection("users").limit(1).get();
  const isFirstUser = usersSnapshot.empty;

  const newProfile: UserProfile = {
    uid: decoded.uid,
    email: decoded.email || "",
    displayName: decoded.name || decoded.email || "",
    photoURL: decoded.picture || null,
    role: isFirstUser ? "admin" : "user",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  await userRef.set(newProfile);
  return NextResponse.json(newProfile);
}
