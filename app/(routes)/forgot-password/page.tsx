"use client";

import { useState } from "react";
import Link from "next/link";
import BasketIcon from "@/components/BasketIcon";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        let message = "Could not send reset email.";
        try {
          const data = await res.json();
          message = data.detail || message;
        } catch {
          // Keep generic fallback message.
        }
        throw new Error(message);
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="h-screen w-screen flex items-center justify-center bg-gray-50 px-4 overflow-hidden fixed inset-0 -mt-16">
      <div className="w-full max-w-md">
        <BasketIcon size={80} className="mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">
          Forgot password
        </h1>
        <p className="text-sm text-gray-600 text-center mb-5">
          Enter your email and we will send you a reset link.
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Sending..." : "Send reset email"}
          </button>
        </form>

        {sent && (
          <p className="text-sm text-green-700 text-center mt-3">
            If an account exists for that email, a reset link has been sent.
          </p>
        )}
        {error && <p className="text-sm text-red-600 text-center mt-3">{error}</p>}

        <p className="text-center text-gray-600 mt-4 text-sm">
          Remembered your password?{" "}
          <Link href="/login" className="text-green-600 hover:text-green-700 font-medium">
            Back to login
          </Link>
        </p>
      </div>
    </section>
  );
}
