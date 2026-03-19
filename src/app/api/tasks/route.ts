import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { Task } from "@/lib/types";
import { sendTaskAssignmentEmail } from "@/lib/email";

export async function GET(request: NextRequest) {
  const decoded = await verifyAuthToken(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  const isAdmin = userDoc.data()?.role === "admin";

  let query: FirebaseFirestore.Query = adminDb.collection("tasks");

  if (!isAdmin) {
    query = query.where("assignees", "array-contains", decoded.uid);
  }

  const snapshot = await query.orderBy("createdAt", "desc").get();
  const tasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const decoded = await verifyAuthToken(request);
  if (!decoded) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, dueDate, recurrence, assignees } = body;

  if (!name || !dueDate || !recurrence || !assignees?.length) {
    return NextResponse.json({ error: "Missing required fields: name, dueDate, recurrence, assignees" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const task: Omit<Task, "id"> = {
    name,
    description: description || "",
    dueDate,
    recurrence,
    status: "pending",
    assignees,
    createdBy: decoded.uid,
    createdAt: now,
    updatedAt: now,
    updates: [],
  };

  const docRef = await adminDb.collection("tasks").add(task);

  // Send email notifications to assignees
  try {
    const assigneeDocs = await Promise.all(
      assignees.map((uid: string) => adminDb.collection("users").doc(uid).get())
    );
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    await Promise.all(
      assigneeDocs
        .filter((doc) => doc.exists)
        .map((doc) => {
          const data = doc.data()!;
          return sendTaskAssignmentEmail(data.email, data.displayName, name, dueDate, appUrl);
        })
    );
  } catch (err) {
    console.error("Failed to send task assignment emails:", err);
  }

  return NextResponse.json({ id: docRef.id, ...task }, { status: 201 });
}
