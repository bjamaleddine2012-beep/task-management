import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  const decoded = await verifyAuthToken(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requesterDoc = await adminDb.collection("users").doc(decoded.uid).get();
  if (!requesterDoc.exists || requesterDoc.data()?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const usersSnapshot = await adminDb.collection("users").orderBy("createdAt", "desc").get();
  const users = usersSnapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));

  return NextResponse.json(users);
}

export async function PATCH(request: NextRequest) {
  const decoded = await verifyAuthToken(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requesterDoc = await adminDb.collection("users").doc(decoded.uid).get();
  if (!requesterDoc.exists || requesterDoc.data()?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { uid, role } = await request.json();
  if (!uid || !["admin", "user"].includes(role)) {
    return NextResponse.json({ error: "Invalid uid or role" }, { status: 400 });
  }

  await adminDb.collection("users").doc(uid).update({ role });
  return NextResponse.json({ success: true });
}
