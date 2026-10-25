import {
  buildFxPayload,
  type FxPayload,
  type FxProviderQuote,
  type FxProviderSnapshot,
  type FxSnapshot,
  type FxSnapshotArtifact,
} from "./fx";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type FxCronPersistence =
  | {
      status: "persisted";
      target: string;
    }
  | {
      env: "FX_SNAPSHOT_WEBHOOK_URL";
      note: string;
      status: "connector-needed";
    };

export type FxCronResult = {
  fallbackReason?: string;
  generatedAt: string;
  payloadProvenance: FxPayload["provenance"];
  persistence: FxCronPersistence;
  snapshot: FxSnapshot;
};

function stripRuntimeFields(provider: FxProviderQuote): FxProviderSnapshot {
  return {
    capturedAt: provider.capturedAt,
    caveat: provider.caveat,
    feeUSD: provider.feeUSD,
    method: provider.method,
    provider: provider.provider,
    quotedRate: provider.quotedRate,
    receiveAmountFor1000USD: provider.receiveAmountFor1000USD,
    sourceUrl: provider.sourceUrl,
  };
}

export function snapshotFromFxPayload(payload: FxPayload, capturedAt = payload.generatedAt): FxSnapshot {
  return {
    capturedAt,
    midMarket: payload.midMarket,
    providers: payload.providers.map(stripRuntimeFields),
  };
}

async function forwardSnapshot({
  fetchImpl,
  snapshot,
  webhookUrl,
}: {
  fetchImpl: FetchLike;
  snapshot: FxSnapshot;
  webhookUrl: string;
}) {
  const response = await fetchImpl(webhookUrl, {
    body: JSON.stringify({
      artifactFamily: "fx-snapshots",
      snapshot,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`FX snapshot webhook returned HTTP ${response.status}.`);
  }
}

export async function buildDailyFxSnapshot({
  capturedAt = new Date().toISOString(),
  fetchImpl = fetch,
  snapshotArtifact,
  webhookUrl,
}: {
  capturedAt?: string;
  fetchImpl?: FetchLike;
  snapshotArtifact: FxSnapshotArtifact;
  webhookUrl?: string;
}): Promise<FxCronResult> {
  const payload = await buildFxPayload({ fetchImpl, snapshotArtifact });
  const snapshot = snapshotFromFxPayload(payload, capturedAt);

  if (webhookUrl) {
    await forwardSnapshot({ fetchImpl, snapshot, webhookUrl });

    return {
      fallbackReason: payload.fallbackReason,
      generatedAt: payload.generatedAt,
      payloadProvenance: payload.provenance,
      persistence: {
        status: "persisted",
        target: webhookUrl,
      },
      snapshot,
    };
  }

  return {
    fallbackReason: payload.fallbackReason,
    generatedAt: payload.generatedAt,
    payloadProvenance: payload.provenance,
    persistence: {
      env: "FX_SNAPSHOT_WEBHOOK_URL",
      note:
        "Vercel cron captured the snapshot, but durable history needs a configured webhook or storage sink.",
      status: "connector-needed",
    },
    snapshot,
  };
}
