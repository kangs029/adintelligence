import { NextRequest, NextResponse } from "next/server";

import {
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_COOKIE_NAME,
  accessResponseHeaders,
  deriveAccessToken,
  readAccessPassword,
  renderAccessPage,
  sanitizeNextPath,
  secureEqual,
} from "@/lib/access/access-gate";

const ROBOTS_VALUE = "noindex, nofollow, noarchive";

function gateResponse(
  status: 401 | 503,
  nextPath: string,
  state: "incorrect" | "unavailable",
) {
  return new NextResponse(renderAccessPage({ nextPath, state }), {
    status,
    headers: accessResponseHeaders(),
  });
}

export async function POST(request: NextRequest) {
  const configuredPassword = readAccessPassword();
  if (!configuredPassword) {
    return gateResponse(503, "/", "unavailable");
  }

  let submittedPassword = "";
  let nextPath = "/";

  try {
    const form = await request.formData();
    submittedPassword = String(form.get("password") ?? "");
    nextPath = sanitizeNextPath(String(form.get("next") ?? "/"));
  } catch {
    return gateResponse(401, "/", "incorrect");
  }

  if (!secureEqual(submittedPassword, configuredPassword)) {
    return gateResponse(401, nextPath, "incorrect");
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url), 303);
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: deriveAccessToken(configuredPassword),
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", ROBOTS_VALUE);

  return response;
}
