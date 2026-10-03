"use client";
import { useState } from "react";
export function AdminLogout() {
  const [error, setError] = useState("");
  async function logout() {
    try {
      const response = await fetch("/api/admin-auth/logout", {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      window.location.replace("/admin-login");
    } catch {
      setError("Could not sign out. Please try again.");
    }
  }
  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-red-700" role="status">
        {error}
      </p>
      <button
        onClick={logout}
        className="border border-slate-300 bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50"
      >
        Sign out
      </button>
    </div>
  );
}
