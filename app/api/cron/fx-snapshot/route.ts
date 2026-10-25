import type { NextRequest } from "next/server";
import fxSnapshotsArtifact from "@/data/artifacts/fx-snapshots.json";
import { buildDailyFxSnapshot } from "@/lib/data/fx-cron";
import type { FxSnapshotArtifact } from "@/lib/data/fx";

export const dynamic = "force-dynamic";

function authorizationFailure(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const webhookUrl = process.env.FX_SNAPSHOT_WEBHOOK_URL;

  if (webhookUrl && !cronSecret) {
    return Response.json(
      {
        status: "blocked",
        reason: "CRON_SECRET is required before enabling FX_SNAPSHOT_WEBHOOK_URL persistence.",
      },
      { status: 500 },
    );
  }

  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }

  return null;
}

export async function GET(request: NextRequest) {
  const blocked = authorizationFailure(request);
  if (blocked) return blocked;

  try {
    const result = await buildDailyFxSnapshot({
      snapshotArtifact: fxSnapshotsArtifact as FxSnapshotArtifact,
      webhookUrl: process.env.FX_SNAPSHOT_WEBHOOK_URL,
    });

    return Response.json(
      {
        ...result,
        status: result.persistence.status === "persisted" ? "persisted" : "captured",
      },
      {
        headers: { "cache-control": "no-store" },
        status: result.persistence.status === "persisted" ? 200 : 202,
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        status: "failed",
      },
      { status: 502 },
    );
  }
}
