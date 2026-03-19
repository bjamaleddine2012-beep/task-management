"use client";

import { useState } from "react";
import { Task } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import TaskUpdateFeed from "./TaskUpdateFeed";

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  onUpdated: () => void;
}

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

export default function TaskDetailModal({ task, onClose, onUpdated }: TaskDetailModalProps) {
  const { user, userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";

  const [message, setMessage] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== "completed";

  const handleAddUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/tasks/${task.id}/updates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          newStatus: newStatus || undefined,
        }),
      });

      if (res.ok) {
        setMessage("");
        setNewStatus("");
        onUpdated();
      }
    } catch (err) {
      console.error("Failed to add update:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    setDeleting(true);
    try {
      const token = await user!.getIdToken();
      await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onUpdated();
      onClose();
    } catch (err) {
      console.error("Failed to delete task:", err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{task.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                  isOverdue
                    ? "bg-red-100 text-red-800"
                    : task.status === "completed"
                    ? "bg-green-100 text-green-800"
                    : task.status === "in-progress"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {isOverdue ? "Overdue" : task.status.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {task.recurrence === "one-time" ? "One-time" : task.recurrence.charAt(0).toUpperCase() + task.recurrence.slice(1)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {task.description && (
            <p className="text-sm text-gray-600">{task.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Due Date</span>
              <p className="font-medium text-gray-900">{new Date(task.dueDate).toLocaleDateString()}</p>
            </div>
            <div>
              <span className="text-gray-500">Assignees</span>
              <p className="font-medium text-gray-900">{task.assignees.length} person{task.assignees.length !== 1 ? "s" : ""}</p>
            </div>
            <div>
              <span className="text-gray-500">Created</span>
              <p className="font-medium text-gray-900">{new Date(task.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <span className="text-gray-500">Last Updated</span>
              <p className="font-medium text-gray-900">{new Date(task.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Updates</h3>
            <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <TaskUpdateFeed updates={task.updates} />
            </div>
          </div>

          <form onSubmit={handleAddUpdate} className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Add Update</h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="Write an update..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            <div className="flex items-center gap-3">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">No status change</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Posting..." : "Post Update"}
              </button>
            </div>
          </form>

          {isAdmin && (
            <div className="pt-2 border-t border-gray-200">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete Task"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
