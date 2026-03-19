import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  return NextResponse.json({ id: taskDoc.id, ...task });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await request.json();

  if (isAdmin) {
    const allowedFields = ["name", "description", "dueDate", "recurrence", "status", "assignees"];
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }
    await adminDb.collection("tasks").doc(id).update(updates);
    return NextResponse.json({ success: true });
  }

  if (!task.assignees.includes(decoded.uid)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (body.status && ["pending", "in-progress", "completed"].includes(body.status)) {
    await adminDb.collection("tasks").doc(id).update({
      status: body.status,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Users can only update task status" }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const decoded = await verifyAuthToken(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  await adminDb.collection("tasks").doc(id).delete();
  return NextResponse.json({ success: true });
}
