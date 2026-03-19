"use client";

import { TaskUpdate } from "@/lib/types";

const statusColors: Record<string, string> = {
  pending: "text-yellow-600",
  "in-progress": "text-blue-600",
  completed: "text-green-600",
};

export default function TaskUpdateFeed({ updates }: { updates: TaskUpdate[] }) {
  if (updates.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">No updates yet</p>;
  }

  return (
    <div className="space-y-3">
      {[...updates].reverse().map((update) => (
        <div key={update.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 bg-blue-400 rounded-full mt-2" />
            <div className="w-px flex-1 bg-gray-200" />
          </div>
          <div className="pb-4 flex-1">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">{update.userName}</span>
              <span>&middot;</span>
              <span>{new Date(update.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm text-gray-700 mt-0.5">{update.message}</p>
            {update.newStatus && (
              <span className={`text-xs font-medium mt-1 inline-block ${statusColors[update.newStatus] || "text-gray-600"}`}>
                Status changed to {update.newStatus.replace("-", " ")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
