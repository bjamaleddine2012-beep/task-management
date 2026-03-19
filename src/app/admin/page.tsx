"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import TaskCreateForm from "@/components/TaskCreateForm";
import { Task } from "@/lib/types";
import Link from "next/link";

export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminGate />
    </AuthGuard>
  );
}

function AdminGate() {
  const { user, userProfile } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_verified");
    if (stored === "true") setVerified(true);
  }, []);

  if (userProfile?.role !== "admin") {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="bg-red-50 rounded-lg p-6">
          <h1 className="text-lg font-bold text-red-800">Access Denied</h1>
          <p className="text-sm text-red-600 mt-2">You don&apos;t have admin privileges.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!verified) {
    const handleVerify = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setVerifying(true);
      try {
        const token = await user!.getIdToken();
        const res = await fetch("/api/admin/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          sessionStorage.setItem("admin_verified", "true");
          setVerified(true);
        } else {
          const data = await res.json();
          setError(data.error || "Invalid password");
        }
      } catch {
        setError("Something went wrong");
      } finally {
        setVerifying(false);
      }
    };

    return (
      <div className="max-w-sm mx-auto px-4 py-20">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-900 text-center mb-1">Admin Panel</h1>
          <p className="text-sm text-gray-500 text-center mb-6">Enter admin password to continue</p>
          <form onSubmit={handleVerify} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
            )}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={verifying || !password}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {verifying ? "Verifying..." : "Enter Admin Panel"}
            </button>
          </form>
          <Link href="/" className="block mt-4 text-center text-sm text-gray-500 hover:text-gray-700">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <AdminContent />;
}

function AdminContent() {
  const { user, signOut } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/tasks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTasks(await res.json());
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleDelete = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    setDeleting(taskId);
    try {
      const token = await user!.getIdToken();
      await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTasks();
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(null);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const token = await user!.getIdToken();
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchTasks();
    } catch (err) {
      console.error("Failed to update:", err);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Create Task
          </button>
          <Link
            href="/"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back
          </Link>
          <button
            onClick={signOut}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Tasks */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
          <p className="text-gray-500">No tasks yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Task</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Recurrence</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Assignees</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tasks.map((task) => {
                  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== "completed";
                  return (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{task.name}</p>
                        {task.description && (
                          <p className="text-xs text-gray-500 truncate max-w-xs">{task.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          className="text-xs border border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="pending">Pending</option>
                          <option value="in-progress">In Progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {new Date(task.dueDate).toLocaleDateString()}
                        {isOverdue && <span className="ml-1 text-xs text-red-600 font-bold">!</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {task.recurrence === "one-time" ? "One-time" : task.recurrence}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {task.assignees.length} person{task.assignees.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(task.id)}
                          disabled={deleting === task.id}
                          className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                        >
                          {deleting === task.id ? "..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreateForm && (
        <TaskCreateForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            fetchTasks();
            setShowCreateForm(false);
          }}
        />
      )}
    </div>
  );
}
