"use client";

import { Task } from "@/lib/types";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  "in-progress": "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
};

const recurrenceLabels: Record<string, string> = {
  "one-time": "One-time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== "completed";
  const displayStatus = isOverdue ? "overdue" : task.status;

  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-gray-900 truncate">{task.name}</h3>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusColors[displayStatus]}`}>
          {displayStatus.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
      </div>

      {task.description && (
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{recurrenceLabels[task.recurrence]}</span>
        <span>{task.assignees.length} assignee{task.assignees.length !== 1 ? "s" : ""}</span>
      </div>

      {task.updates.length > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {task.updates.length} update{task.updates.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
