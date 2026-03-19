import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const decoded = await verifyAuthToken(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskDoc = await adminDb.collection("tasks").doc(id).get();
  if (!taskDoc.exists) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const task = taskDoc.data()!;
  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  const isAdmin = userDoc.data()?.role === "admin";

  if (!isAdmin && !task.assignees.includes(decoded.uid)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { message, newStatus } = await request.json();
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const update = {
    id: crypto.randomUUID(),
    userId: decoded.uid,
    userName: userDoc.data()?.displayName || decoded.email || "Unknown",
    message,
    newStatus: newStatus || undefined,
    createdAt: new Date().toISOString(),
  };

  const updateData: Record<string, unknown> = {
    updates: FieldValue.arrayUnion(update),
    updatedAt: new Date().toISOString(),
  };

  if (newStatus && ["pending", "in-progress", "completed"].includes(newStatus)) {
    updateData.status = newStatus;
  }

  await adminDb.collection("tasks").doc(id).update(updateData);
  return NextResponse.json(update, { status: 201 });
}
