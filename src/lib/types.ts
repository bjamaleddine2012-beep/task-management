export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: "admin" | "user";
  createdAt: string;
  lastLoginAt: string;
}

export interface TaskUpdate {
  id: string;
  userId: string;
  userName: string;
  message: string;
  newStatus?: "pending" | "in-progress" | "completed";
  createdAt: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  dueDate: string;
  recurrence: "one-time" | "daily" | "weekly" | "monthly";
  status: "pending" | "in-progress" | "completed" | "overdue";
  assignees: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updates: TaskUpdate[];
}
