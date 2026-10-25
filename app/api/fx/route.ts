import fxSnapshotsArtifact from "@/data/artifacts/fx-snapshots.json";
import fxManualQuotes from "@/data/curation/fx-manual-quotes.json";
import { buildFxPayload, type FxManualQuoteOverlay, type FxSnapshotArtifact } from "@/lib/data/fx";

export const revalidate = 3600;

const allowedAmounts = new Set([200, 1000, 5000]);

function sendAmountFromRequest(request: Request) {
  const amount = Number(new URL(request.url).searchParams.get("amount") ?? 1000);
  return allowedAmounts.has(amount) ? amount : 1000;
}

export async function GET(request: Request) {
  const payload = await buildFxPayload({
    manualQuotes: fxManualQuotes as FxManualQuoteOverlay,
    sendAmountUSD: sendAmountFromRequest(request),
    snapshotArtifact: fxSnapshotsArtifact as FxSnapshotArtifact,
  });

  return Response.json(payload, {
    headers: {
      "cache-control": "s-maxage=3600, stale-while-revalidate=300",
    },
  });
}
