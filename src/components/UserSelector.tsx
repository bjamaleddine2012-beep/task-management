"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { UserProfile } from "@/lib/types";

interface UserSelectorProps {
  selected: string[];
  onChange: (uids: string[]) => void;
}

export default function UserSelector({ selected, onChange }: UserSelectorProps) {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setUsers(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch users:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [user]);

  const toggleUser = (uid: string) => {
    if (selected.includes(uid)) {
      onChange(selected.filter((id) => id !== uid));
    } else {
      onChange([...selected, uid]);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Loading users...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg divide-y divide-gray-100">
        {users.map((u) => (
          <label
            key={u.uid}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(u.uid)}
              onChange={() => toggleUser(u.uid)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {u.photoURL && (
              <img src={u.photoURL} alt="" className="w-6 h-6 rounded-full" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{u.displayName}</p>
              <p className="text-xs text-gray-500 truncate">{u.email}</p>
            </div>
            {u.role === "admin" && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Admin</span>
            )}
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-gray-500">{selected.length} user{selected.length !== 1 ? "s" : ""} selected</p>
      )}
    </div>
  );
}
