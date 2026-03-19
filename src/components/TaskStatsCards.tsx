"use client";

import { Task } from "@/lib/types";

export default function TaskStatsCards({ tasks }: { tasks: Task[] }) {
  const now = new Date();
  const total = tasks.length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const overdue = tasks.filter((t) => new Date(t.dueDate) < now && t.status !== "completed").length;

  const stats = [
    { label: "Total", value: total, color: "bg-gray-100 text-gray-800" },
    { label: "Pending", value: pending, color: "bg-yellow-100 text-yellow-800" },
    { label: "In Progress", value: inProgress, color: "bg-blue-100 text-blue-800" },
    { label: "Completed", value: completed, color: "bg-green-100 text-green-800" },
    { label: "Overdue", value: overdue, color: "bg-red-100 text-red-800" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className={`${stat.color} rounded-lg p-4 text-center`}>
          <p className="text-2xl font-bold">{stat.value}</p>
          <p className="text-xs font-medium mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
