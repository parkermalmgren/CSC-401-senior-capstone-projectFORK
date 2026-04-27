"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Supabase may redirect password recovery to Site URL (/) if redirect_to is not allow-listed.
 * If tokens land on the home page in the URL hash, forward to /reset-password.
 */
export default function AuthRecoveryHashRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    const params = new URLSearchParams(raw);
    const type = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (type === "recovery" && accessToken && refreshToken) {
      router.replace(`/reset-password#${raw}`);
    }
  }, [router, pathname]);

  return null;
}
