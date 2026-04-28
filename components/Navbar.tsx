"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import BasketIcon from "./BasketIcon";
import { clearAuthToken } from "@/lib/api";

// Read the JS-visible hint cookie (sp_session_exists) to detect auth state.
// The actual session token (sp_session) is HttpOnly and not accessible here.
function hasSessionCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith("sp_session_exists="));
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setAuthed(hasSessionCookie());
  }, [pathname]);

  useEffect(() => {
    const update = () => setAuthed(hasSessionCookie());
    window.addEventListener("auth-change", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("auth-change", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    clearAuthToken();
    // Ask the server to clear the HttpOnly cookie
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.dispatchEvent(new Event("auth-change"));
    router.replace("/");
    setMobileMenuOpen(false);
  }

  const links = [
    ...(authed
      ? [
          { name: "Dashboard", href: "/dashboard" },
          { name: "Pantry", href: "/pantry" },
          { name: "Recipes", href: "/recipes" },
          { name: "Shopping", href: "/shopping" },
          { name: "About", href: "/about" },
          { name: "Account", href: "/admin" },
        ]
      : [
          { name: "Home", href: "/" },
          { name: "About", href: "/about" }
        ]),
  ];

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-white/95 backdrop-blur-md shadow-sm transition-all duration-300">
      <div className="w-full flex h-16 items-center justify-between px-4 md:px-6">
        {/* Brand - Flush Left */}
        <Link
          href={authed ? "/dashboard" : "/"}
          className="flex items-center gap-2 font-semibold text-slate-900"
          onClick={() => setMobileMenuOpen(false)}
        >
          <BasketIcon size={32} className="" />
          <span className="hidden sm:inline">SmartPantry</span>
        </Link>

        {/* Desktop Links - Flush Right */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  active
                    ? "bg-green-600 text-white"
                    : "text-slate-700 hover:bg-green-50"
                }`}
              >
                {link.name}
              </Link>
            );
          })}

          {authed ? (
            <button
              onClick={handleLogout}
              className="ml-3 rounded-full px-4 py-1.5 text-sm font-medium transition border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Log out
            </button>
          ) : (
            <>
              <Link
                href="/login"
                className="ml-3 rounded-full bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full px-4 py-1.5 text-sm font-medium transition border border-green-600 text-green-700 hover:bg-green-50"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white">
          <div className="px-4 py-3 space-y-2">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    active
                      ? "bg-green-600 text-white"
                      : "text-slate-700 hover:bg-green-50"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}

            {authed ? (
              <button
                onClick={handleLogout}
                className="w-full text-left rounded-lg px-4 py-2 text-sm font-medium transition border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Log out
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block rounded-lg px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition text-center"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="block rounded-lg px-4 py-2 text-sm font-medium transition border border-green-600 text-green-700 hover:bg-green-50 text-center"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}