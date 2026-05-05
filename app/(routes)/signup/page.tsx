"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import BasketIcon from "@/components/BasketIcon";
import { setAuthToken } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Disable scrolling when component mounts
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Re-enable scrolling when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    // Basic validation
    if (pw !== confirmPw) {
      setErr("Passwords don't match.");
      setLoading(false);
      return;
    }

    if (!agreeTerms) {
      setErr("Please agree to the Terms of Service and Privacy Policy.");
      setLoading(false);
      return;
    }

    try {
      // Call the Next.js API route which sets an HttpOnly session cookie
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${firstName} ${lastName}`, email, password: pw }),
      });

      if (!res.ok) {
        let errorMessage = "Sign up failed";
        try {
          const data = await res.json();
          errorMessage = data.detail || errorMessage;
        } catch {
          if (res.status === 429) {
            errorMessage = "Too many signup attempts. Please wait a minute before trying again.";
          }
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      // Keep the JWT in memory so API calls work without re-fetching the cookie
      setAuthToken(data.token);
      window.dispatchEvent(new Event("auth-change"));
      router.replace("/dashboard");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="h-screen w-screen flex items-center justify-center bg-gray-50 px-4 overflow-hidden fixed inset-0" style={{overflow: 'hidden'}}>
      <div className="w-full max-w-md">
        {/* Basket Icon */}
        <BasketIcon size={80} className="mb-4" />

        {/* Signup Title */}
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-4">Sign Up</h1>

        <form onSubmit={onSubmit} className="space-y-3">
          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
                required
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
                required
              />
            </div>
          </div>

          {/* Email Field */}
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

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
              required
            />
          </div>

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-colors"
              required
            />
          </div>

          {/* Terms Agreement */}
          <div className="flex items-start">
            <input
              type="checkbox"
              id="agreeTerms"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2 mt-1"
              required
            />
            <label htmlFor="agreeTerms" className="ml-2 text-sm text-gray-700">
              I agree to the{" "}
              <Link href="#" className="text-green-600 hover:text-green-700">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="#" className="text-green-600 hover:text-green-700">
                Privacy Policy
              </Link>
            </label>
          </div>

          {/* Sign Up Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          {err && <p className="text-sm text-red-600 text-center">{err}</p>}
        </form>

        {/* Login Link */}
        <p className="text-center text-gray-600 mt-3 text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-green-600 hover:text-green-700 font-medium">
            Log in
          </Link>
        </p>

      </div>
    </section>
  );
}