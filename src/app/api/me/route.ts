import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { UserProfile } from "@/lib/types";

export async function GET(request: NextRequest) {
  let decoded;
  try {
    decoded = await verifyAuthToken(request);
  } catch (err) {
    console.error("Auth error:", err);
    return NextResponse.json({ error: "Auth failed", details: String(err) }, { status: 401 });
  }
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Hardcoded admin email
  const ADMIN_EMAIL = "bjamaleddine2012@gmail.com";
  const isAdmin = decoded.email === ADMIN_EMAIL;

  const userRef = adminDb.collection("users").doc(decoded.uid);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    const updateData: Record<string, string> = { lastLoginAt: new Date().toISOString() };
    // Always ensure admin email has admin role
    if (isAdmin && userDoc.data()?.role !== "admin") {
      updateData.role = "admin";
    }
    await userRef.update(updateData);
    return NextResponse.json({ uid: decoded.uid, ...userDoc.data(), ...updateData });
  }

  const newProfile: UserProfile = {
    uid: decoded.uid,
    email: decoded.email || "",
    displayName: decoded.name || decoded.email || "",
    photoURL: decoded.picture || null,
    role: isAdmin ? "admin" : "user",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  await userRef.set(newProfile);
  return NextResponse.json(newProfile);
}
