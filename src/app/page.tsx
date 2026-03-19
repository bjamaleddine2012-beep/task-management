"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import TaskStatsCards from "@/components/TaskStatsCards";
import TaskList from "@/components/TaskList";
import TaskCreateForm from "@/components/TaskCreateForm";
import TaskDetailModal from "@/components/TaskDetailModal";
import { Task } from "@/lib/types";
import Link from "next/link";

export default function HomePage() {
  return (
    <AuthGuard>
      <TaskDashboard />
    </AuthGuard>
  );
}

function TaskDashboard() {
  const { user, userProfile, signOut } = useAuth();
  const isAdmin = userProfile?.role === "admin";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/tasks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTasks(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleTaskUpdated = async () => {
    await fetchTasks();
    if (selectedTask) {
      const updated = tasks.find((t) => t.id === selectedTask.id);
      if (updated) setSelectedTask(updated);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome, {userProfile?.displayName}
            {isAdmin && <span className="ml-2 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Admin</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin"
              className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors"
            >
              Admin Panel
            </Link>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + Create Task
            </button>
          )}
          <button
            onClick={signOut}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Stats */}
      <TaskStatsCards tasks={tasks} />

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <TaskList tasks={tasks} onTaskClick={setSelectedTask} />
      )}

      {/* Modals */}
      {showCreateForm && (
        <TaskCreateForm
          onClose={() => setShowCreateForm(false)}
          onCreated={fetchTasks}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleTaskUpdated}
        />
      )}
    </div>
  );
}
