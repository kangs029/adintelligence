import { type NextRequest, NextResponse } from "next/server";

// Password gate disabled for demo deployment.
// Re-enable by restoring the access-gate logic and setting XPAT_ACCESS_PASSWORD.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
