"use client";

import { useState } from "react";
import { Task } from "@/lib/types";
import TaskCard from "./TaskCard";

interface TaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const filters = ["all", "pending", "in-progress", "completed", "overdue"] as const;

export default function TaskList({ tasks, onTaskClick }: TaskListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredTasks = tasks.filter((task) => {
    const isOverdue = new Date(task.dueDate) < new Date() && task.status !== "completed";
    const displayStatus = isOverdue ? "overdue" : task.status;

    const matchesSearch =
      task.name.toLowerCase().includes(search.toLowerCase()) ||
      task.description.toLowerCase().includes(search.toLowerCase());

    const matchesFilter = statusFilter === "all" || displayStatus === statusFilter;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
        <div className="flex gap-1 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                statusFilter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "all" ? "All" : f.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No tasks found</p>
          <p className="text-sm mt-1">
            {search || statusFilter !== "all" ? "Try adjusting your filters" : "Tasks will appear here once created"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </div>
      )}
    </div>
  );
}
