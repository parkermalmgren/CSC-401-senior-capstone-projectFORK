# Security Changes — Smart Pantry

**Date:** 2026-03-31
**Branch:** creed-sprint-7-security-and-tests

This document describes the five security enhancements implemented in this sprint. Each section covers the vulnerability, what was changed, and how to verify the fix.

---

## Plain English Summary

A quick, non-technical explanation of each change — useful for presentations, demos, or explaining the work to non-developers.

---

#1. Cookie flags → a lock that JavaScript can't pick
  #2. JWT validation → replacing a Post-it note room key with a tamper-proof ID badge                
  #3. Security headers → turning on standard safety signs that exist but weren't switched on
  #4. File upload validation → a bouncer at the door who checks what a file actually is, not what it
  claims to be
  #5. Error sanitization → stopping the app from handing strangers a printout of its internal        
  security procedures


**1. We put a lock on the login key that JavaScript can't pick.**

When you log into a website, the site gives your browser a "session token" — basically a key that proves who you are for all future requests. Before this fix, that key was stored in a place where any piece of JavaScript on the page could read it. If a hacker ever managed to sneak malicious code onto our site (a very common attack called XSS), they could quietly steal that key and use it to log into your account from anywhere in the world. We fixed this by moving the key somewhere that JavaScript cannot touch at all — only the browser itself can use it. We also added a rule that the key only works on our own site, never on a third-party page, so a malicious website can't trick your browser into using your key on your behalf.

---

**2. We replaced a Post-it note with an actual ID badge.**

Before this fix, the "key" we gave users after login was literally just their account ID number — the same number that might appear in a URL or a database. That is like a hotel giving guests a room key that is just a sticky note with the room number written on it. Anyone who knows the number can walk in. We replaced that with a real cryptographically signed token — think of it like a tamper-proof ID badge issued by a trusted authority (Supabase). The badge has your name on it, a signature that cannot be forged, and an expiry date. The server now checks the badge is genuine before letting anyone in, instead of just trusting whatever number is handed to it.

---

**3. We added standard safety signs to the front door.**

Modern browsers support a set of built-in protections, but websites have to explicitly ask for them. Before this fix we had not turned any of them on. This is like a bank branch that has no "no photography" signs, no bullet-proof glass, and no HTTPS padlock on the door — the protections exist, they just had not been switched on. We enabled five: one that stops attackers from hiding our site inside their own page to trick users into clicking things, one that stops the browser from misidentifying uploaded files as executable code, one that forces all connections to use the secure (HTTPS) version of the site, one that limits what sensitive browser features (camera, location) the page can access, and one that controls what information we share when users click links to other sites.

---

**4. We put a bouncer at the receipt upload door.**

The app lets users upload a photo of a grocery receipt to automatically add items to their pantry. Before this fix, the server would accept literally any file of any size with no questions asked — a 1 GB video, a virus, a script disguised as a photo. It would load the entire file into memory and ship it off to our AI provider. This is expensive, slow, and potentially dangerous. We added a bouncer: files are now checked at the door before anything else happens. The bouncer rejects anything over 10 MB and anything that does not have the right internal signature for a photo (JPEG, PNG, or WebP). A renamed file cannot sneak through — we check what the file actually is, not just what it claims to be.

---

**5. We stopped the app from accidentally telling hackers how it works.**

When something goes wrong inside a web application, the server produces an error. Before this fix, our app was sending the full technical details of that error directly back to whoever made the request — things like which database tables exist, how our queries are structured, which external services we use, and sometimes fragments of internal configuration. That is like a bank teller handing a confused customer a printout of the bank's internal security procedures. None of that information has any business going to end users. We fixed it so users get a simple, friendly message ("Something went wrong, please try again") while the full technical details are written to our private server logs where only developers can see them.

---

## 1. Secure Session Cookie Flags (Critical)

### Security Holes Fixed
- **XSS session hijacking** — Without `HttpOnly`, any injected JavaScript (via a cross-site scripting attack) could call `document.cookie` and immediately read the session token. The attacker could then replay that token from a different machine to access the account with no further credentials needed.
- **Session theft over HTTP** — Without `Secure`, the browser would transmit the session cookie over unencrypted HTTP connections (e.g., on public Wi-Fi), allowing a network observer to capture it.
- **Cross-Site Request Forgery (CSRF)** — Without `SameSite=Strict`, a malicious third-party website could embed requests to our API (e.g., `<img src="https://ourapp.com/api/items/delete/123">`) and the browser would silently attach the session cookie, performing actions on behalf of the logged-in user.

### Benefit
A compromised session token is the single most damaging thing that can happen to a user account — it grants full access with no password required. These three flags together close the three most common vectors for stealing that token. With `HttpOnly`, even if an XSS vulnerability exists elsewhere in the app, an attacker still cannot exfiltrate the session cookie. With `SameSite=Strict`, CSRF attacks that rely on cookie forwarding are completely neutralized.

### Problem
Session cookies were set via `document.cookie` on the client side, which cannot set the `HttpOnly` flag. The result:
- Any JavaScript (including XSS payloads) could read `document.cookie` and steal the session token.
- The cookies had no `Secure` or `SameSite` flags, leaving them exposed over HTTP and to CSRF.

### What Changed

**New Next.js API routes (server-side cookie management):**
- `app/api/auth/login/route.ts` — proxies login to FastAPI, sets cookies via `Set-Cookie` response header.
- `app/api/auth/signup/route.ts` — same for signup.
- `app/api/auth/logout/route.ts` — clears both cookies with `Max-Age=0`.
- `app/api/auth/token/route.ts` — reads the HttpOnly cookie server-side and returns the token to same-origin requests (used for page-refresh token re-hydration).

**Cookie flags now set on all session cookies:**
```
sp_session:        HttpOnly; Secure (prod); SameSite=Strict; Max-Age=86400
sp_session_exists: Secure (prod); SameSite=Strict; Max-Age=86400  ← JS-readable hint
```
`HttpOnly` prevents JavaScript from reading the real session token. `SameSite=Strict` blocks cross-site request forgery. `Secure` enforces HTTPS in production.

**Files modified:**
- `app/(routes)/login/page.tsx` — calls `/api/auth/login` instead of FastAPI directly; stores token in memory via `setAuthToken()`.
- `app/(routes)/signup/page.tsx` — same pattern.
- `components/Navbar.tsx` — logout calls `/api/auth/logout`; auth detection uses the hint cookie `sp_session_exists`.
- `lib/api.ts` — replaced cookie-reading `getUserId()` with an in-memory token store (`_authToken`). Exported `setAuthToken`, `clearAuthToken`, `getAuthToken`. On page refresh, `getAuthToken()` re-hydrates by calling `/api/auth/token`.
- `components/AccountSettings.tsx`, `components/DashboardHome.tsx`, `components/ReceiptScannerModal.tsx`, `components/RecipesPage.tsx` — replaced all `document.cookie` reads with `await getAuthToken()`.

### Verify
Open DevTools → Application → Cookies after logging in. The `sp_session` cookie should show a checkmark in the **HttpOnly** column.

---

## 2. Supabase JWT Validation (Critical)

### Security Holes Fixed
- **Trivial account impersonation** — The token was the user's UUID, which is not secret. UUIDs appear in URLs, logs, API responses, and database exports. Any person who had ever seen a user's ID (e.g., from a shared link or a database leak) could call the API as that user with zero additional effort.
- **No expiration or revocation** — A UUID never expires and cannot be invalidated. If a token was leaked, there was no way to stop an attacker from using it indefinitely.
- **No cryptographic proof of identity** — There was nothing stopping someone from guessing or brute-forcing UUIDs and gaining access to random accounts.

### Benefit
A properly signed JWT is cryptographically bound to Supabase's private key. Even if an attacker knows a user's UUID, they cannot forge a valid JWT without knowing that key. JWTs also carry an expiration timestamp (`exp` claim), so a stolen token automatically stops working after its lifetime. This change upgrades the auth system from "trust whatever UUID you claim to be" to "prove you authenticated with Supabase within the last 24 hours."

### Problem
The auth "token" returned by the API was literally the user's UUID. The backend's `get_user_id()` function accepted any UUID passed in an `Authorization: Bearer` header with zero validation — meaning anyone who knew a user's ID could impersonate them.

### What Changed

**Backend (`api/src/main.py`):**
- Added `import jwt as pyjwt` and `PyJWT` to `requirements.txt`.
- Added `SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")` to env config.
- Rewrote `get_user_id()` to **validate** the Bearer token:
  - **Fast path**: if `SUPABASE_JWT_SECRET` is set, verifies the JWT locally using HS256 (no network call).
  - **Fallback**: calls `supabase.auth.get_user(token)` to validate via the Supabase API, with a 5-minute in-memory cache to reduce round-trips.
- **Login endpoint**: now returns `auth_response.session.access_token` (the real Supabase JWT) instead of `user_id`.
- **Signup endpoint**: after creating the user, signs them in to obtain a JWT, then returns that token.

**To enable the fast path**, add to your `.env`:
```
SUPABASE_JWT_SECRET=<your-supabase-jwt-secret>
```
Find this in: Supabase Dashboard → Project Settings → API → JWT Settings → JWT Secret.

### Verify
1. Try calling a protected endpoint (e.g., `GET /api/items`) with a fake Bearer token → should receive `401 Unauthorized`.
2. Log in normally → API calls should work as expected.

---

## 3. Security Headers (High)

### Security Holes Fixed
- **Clickjacking** — Without `X-Frame-Options: DENY`, an attacker could embed Smart Pantry inside an invisible `<iframe>` on their own malicious page. The victim thinks they are clicking on something harmless, but are actually clicking buttons on our app (e.g., deleting their pantry data or confirming a household join). This is called a UI redress attack.
- **MIME-type sniffing** — Without `X-Content-Type-Options: nosniff`, some browsers would try to guess the content type of a response even if the server declared it. An attacker could upload a file that the browser then interprets and executes as JavaScript, leading to XSS.
- **HTTPS downgrade attacks** — Without `Strict-Transport-Security`, users who type the URL directly or follow an `http://` link could have their session intercepted before the browser upgrades to HTTPS. HSTS tells browsers to always use HTTPS for the next 2 years, preventing this.
- **Referrer leakage** — Without a `Referrer-Policy`, navigating away from a logged-in page would send the full URL (including any sensitive query parameters) to third-party sites in the `Referer` header.
- **Unnecessary browser capability exposure** — Without a `Permissions-Policy`, the browser grants the page access to camera, microphone, and geolocation APIs even when not needed, expanding the attack surface if XSS occurs.

### Benefit
Security headers are a low-effort, high-reward defense layer. They are applied by the browser itself, so they work even when application code has bugs. Together these five headers protect against entire categories of browser-based attacks — clickjacking, protocol downgrade, content sniffing, and capability abuse — with a single config block.

### Problem
`next.config.mjs` had no HTTP security headers configured. The app was vulnerable to clickjacking, MIME-type sniffing, and lacked HSTS.

### What Changed

**`next.config.mjs`** — added a `headers()` config that applies to all routes:

| Header | Value | Purpose |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevents clickjacking (iframe embedding) |
| `X-Content-Type-Options` | `nosniff` | Blocks MIME-type sniffing attacks |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer information leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Restricts browser feature access |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Enforces HTTPS for 2 years |

### Verify
```bash
curl -I https://<your-host>/
```
All five headers should appear in the response.

---

## 4. File Upload Validation (High)

### Security Holes Fixed
- **Denial-of-Service (DoS) via memory exhaustion** — Without a size limit, a single request with a 500 MB file would be fully read into memory, base64-encoded (adding ~33% overhead), and then sent to the OpenAI API. With a 20 requests/minute rate limit, an attacker could push ~10 GB/min through the server's memory. This would crash the process or cause severe degradation for all users.
- **Malicious file injection** — Without type checking, a user could upload any file (a script, an executable, a specially crafted polyglot file) by just naming it `.jpg`. The file would be sent to OpenAI as if it were a receipt image. While OpenAI's API adds an additional layer of processing, accepting arbitrary files at the application boundary is a fundamental violation of input validation principles.
- **Wasted OpenAI API spend** — Without validation, sending non-image files to the OpenAI Vision API would consume API quota and incur billing costs while returning useless results.

### Benefit
Validating at the boundary — before any processing happens — is the correct defense-in-depth approach. Checking magic bytes (the actual binary signature of the file) rather than just the filename extension or `Content-Type` header prevents trivial bypass where an attacker simply renames a malicious file. The 10 MB cap also bounds the worst-case cost of any single request, making the endpoint resilient to resource exhaustion attacks even at the allowed rate limit.

### Problem
The receipt scan endpoints (`/api/receipt/scan` and `/api/receipt/scan-mobile`) read the entire uploaded file into memory with no size or type checks. A malicious user could:
- Upload a 500 MB file, exhausting server memory (DoS).
- Upload a non-image file that gets passed to the OpenAI API.

### What Changed

**`api/src/main.py`** — both scan endpoints now validate the upload immediately after reading:

1. **File size**: rejects files larger than **10 MB** with HTTP `413 Payload Too Large`.
2. **File type**: checks magic bytes to whitelist JPEG, PNG, and WebP only. Rejects anything else with HTTP `400 Bad Request`.

```python
# JPEG: \xff\xd8\xff
# PNG:  \x89PNG\r\n\x1a\n
# WebP: RIFF....WEBP
```

### Verify
Send a request to `/api/receipt/scan` with:
- A file larger than 10 MB → expect `413`.
- A text file renamed to `.jpg` → expect `400` (magic bytes won't match).

---

## 5. Sanitized Error Messages (High)

### Security Holes Fixed
- **Information disclosure / reconnaissance** — Raw exception strings reveal the internal structure of the application to anyone who triggers an error. Database errors expose table names, column names, and Supabase query syntax. File path errors reveal server directory structure. These details are exactly what an attacker needs to craft targeted SQL injection, path traversal, or API abuse attacks.
- **Credential and key leakage** — Some exception messages from Supabase or external APIs include partial API keys, connection strings, or auth tokens. Returning those strings verbatim in HTTP responses could expose secrets to any user watching their browser's network tab.
- **Competitive / business intelligence** — Even without a malicious intent, internal error messages expose which third-party services are in use (Supabase, OpenAI, Spoonacular, USDA), the API call patterns, and which operations are failing — information that has no business being in a public HTTP response.

### Benefit
The server logs still contain the full exception details (already wired to `logger.error()`), so debugging is unaffected. Users get a clear, actionable message. Attackers get nothing useful. This is the standard principle of **fail securely**: errors should be informative to operators, opaque to outsiders. Fixing this closes the information disclosure category of OWASP Top 10 (A05:2021 – Security Misconfiguration).

### Problem
Over 25 `500 Internal Server Error` responses returned raw Python exception strings to the client:
```python
raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
raise HTTPException(status_code=500, detail=f"Login failed: {error_msg}")
```
This disclosed internal implementation details: database schema, Supabase query structure, file paths, and partial key values.

### What Changed

**`api/src/main.py`** — all 500-level `detail` strings that contained `{str(e)}` or similar dynamic content were replaced with static, generic messages. The detailed exception is still logged server-side via `logger.error()`.

Examples of what changed:
| Before | After |
|---|---|
| `"Database error: {str(e)}"` | `"An internal error occurred. Please try again."` |
| `"Login failed: {error_msg}"` | `"Authentication failed. Please try again."` |
| `"Failed to change password: {str(e)}"` | `"Failed to change password. Please try again."` |
| `"Error scanning receipt: {error_msg}"` | `"Failed to process receipt. Please try again."` |

A `logger.error()` call was also added to any `except` block that was missing one (e.g., the `get_item` endpoint at the former line 652).

### Verify
Trigger a known 500 error (e.g., temporarily break a DB query) and confirm the response body contains only the generic message. Confirm the full exception is visible in the server logs.

---

## Summary Table

| # | Enhancement | Holes Fixed | Key Benefit | Status |
|---|---|---|---|---|
| 1 | Secure session cookie flags | XSS token theft, session over HTTP, CSRF | Cookie unreadable by JS; browser enforces HTTPS and same-site policy | ✅ Done |
| 2 | Supabase JWT validation | Account impersonation via known UUID, no token expiry | Tokens are cryptographically signed and expire automatically | ✅ Done |
| 3 | Security headers | Clickjacking, MIME sniffing, HTTPS downgrade, referrer leakage | Browser-enforced protection against entire attack categories | ✅ Done |
| 4 | File upload validation | DoS via memory exhaustion, arbitrary file injection | Bounds request cost; rejects non-images before any processing | ✅ Done |
| 5 | Sanitized error messages | Internal info disclosure, potential credential leakage | Operators see full errors in logs; attackers see nothing useful | ✅ Done |

---

## Outstanding / Next Steps

- **Rotate all exposed `.env` credentials** (OpenAI key, Supabase service role key, etc.) — the `.env` file appears to have been committed to Git history.
  Use BFG Repo Cleaner or `git filter-repo` to purge it from history, then rotate all keys.
- Add `SUPABASE_JWT_SECRET` to your `.env` to enable fast local JWT validation.
- Consider adding a Content Security Policy (CSP) header once the auth flow stabilizes.
- Move scan session storage from in-memory dict to Redis for production scalability.
