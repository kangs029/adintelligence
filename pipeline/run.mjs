import { pathToFileURL } from "node:url";

import { loadPipelineEnv } from "./lib/env.mjs";
import { runAnchorSnapshot } from "./anchors/run-anchor-snapshot.mjs";
import { runAnchors } from "./anchors/run-anchors.mjs";
import { runCensusMarkets } from "./census/build-markets.mjs";
import { runCinema } from "./cinema/run-cinema.mjs";
import { runAds } from "./competitors/ads.mjs";
import { runEmployment } from "./employment/run-employment.mjs";
import { runMarketsGeoJson } from "./geo/markets-geojson.mjs";
import { runPlaybookContext } from "./playbook/context.mjs";
import { runPositioning } from "./competitors/positioning.mjs";
import { runV1OfferPort } from "./competitors/port-v1-offers.mjs";
import { runRates } from "./competitors/rates.mjs";
import { runReviewThemes } from "./competitors/review-themes.mjs";
import { runXpatFootprintPort } from "./competitors/port-v1-footprint.mjs";
import { runCreators } from "./community/creators.mjs";
import { runGeoVisibility } from "./community/geo-visibility.mjs";
import { runSwitchMoments } from "./community/switch-moments.mjs";
import { runThreads } from "./community/threads.mjs";
import { runV1CreatorsPort } from "./community/port-v1-creators.mjs";
import { runV1ThreadsPort } from "./community/port-v1-threads.mjs";
import { runStudents } from "./students/run-students.mjs";
import { runXpatAds } from "./xpat-ads/run-xpat-ads.mjs";

const family = process.argv[2] ?? "all";

export function shouldRestorePortedSignalEvidence(artifact) {
  return artifact?.data?.status !== "ok";
}

export async function runSignalsEvidence({
  runCreatorsFn = runCreators,
  runGeoVisibilityFn = runGeoVisibility,
  runSwitchMomentsFn = runSwitchMoments,
  runThreadsFn = runThreads,
  runV1CreatorsPortFn = runV1CreatorsPort,
  runV1ThreadsPortFn = runV1ThreadsPort,
  runXpatFootprintPortFn = runXpatFootprintPort,
} = {}) {
  const threadsArtifact = await runThreadsFn();
  if (shouldRestorePortedSignalEvidence(threadsArtifact)) {
    await runV1ThreadsPortFn();
  }

  const creatorsArtifact = await runCreatorsFn();
  if (shouldRestorePortedSignalEvidence(creatorsArtifact)) {
    await runV1CreatorsPortFn();
  }

  await runSwitchMomentsFn();
  await runGeoVisibilityFn();
  await runXpatFootprintPortFn();
}

async function main() {
  await loadPipelineEnv();

  switch (family) {
    case "all":
      await runCensusMarkets();
      await runAnchorSnapshot();
      await runEmployment();
      await runStudents();
      await runMarketsGeoJson();
      await runCinema();
      await runRates();
      await runAds();
      await runPositioning();
      await runReviewThemes();
      await runV1OfferPort();
      await runSignalsEvidence();
      await runPlaybookContext();
      break;
    case "markets":
      await runCensusMarkets();
      break;
    case "anchors":
      await runAnchorSnapshot();
      break;
    case "anchors-live":
      await runAnchors();
      break;
    case "students":
      await runStudents();
      break;
    case "cinema":
      await runCinema();
      break;
    case "employment":
      await runEmployment();
      break;
    case "markets-geojson":
      await runMarketsGeoJson();
      break;
    case "fx":
    case "rates":
      await runRates();
      break;
    case "ads":
      await runAds();
      break;
    case "positioning":
      await runPositioning();
      break;
    case "reviews":
    case "review-themes":
      await runReviewThemes();
      break;
    case "offers":
      await runV1OfferPort();
      break;
    case "threads":
      await runThreads();
      break;
    case "creators":
      await runCreators();
      break;
    case "signals-port":
      await runV1ThreadsPort();
      await runV1CreatorsPort();
      await runV1OfferPort();
      await runSwitchMoments();
      await runGeoVisibility();
      await runXpatFootprintPort();
      break;
    case "switch-moments":
      await runSwitchMoments();
      break;
    case "geo-visibility":
      await runGeoVisibility();
      break;
    case "xpat-footprint":
      await runXpatFootprintPort();
      break;
    case "playbook-context":
      await runPlaybookContext();
      break;
    case "xpat-ads":
      await runXpatAds();
      break;
    default:
      throw new Error(`Unknown pipeline family "${family}".`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
