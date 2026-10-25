import { readFileSync } from "node:fs";

const DIR = "D:/Infinitra Projects/xpat/reports";

function parseReport(file) {
  const lines = readFileSync(`${DIR}/${file}`, "utf8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);
  // Google Ads CSVs have: row0=report name, row1=date range, row2=headers, row3+=data
  const headerLine = lines[2] ?? lines[0];
  const headers = headerLine.split(",").map(h => h.replace(/"/g, "").trim());
  const rows = lines.slice(3).map(line => {
    const vals = line.split(",");
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").replace(/"/g, "").trim(); });
    return obj;
  });
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// 1. AUCTION INSIGHTS — competitor presence
// ---------------------------------------------------------------------------
console.log("\n===== COMPETITOR PRESENCE (Auction Insights) =====");
console.log("Shows how often competitors appeared vs XPAT in same auctions\n");
const { rows: ai } = parseReport("Auction insights report.csv");
ai.forEach(r => {
  if (!r["Display URL domain"]) return;
  console.log(
    r["Display URL domain"].padEnd(30),
    "| Impression share:", String(r["Impression share"] ?? "").padEnd(8),
    "| Overlap rate:", String(r["Overlap rate"] ?? "").padEnd(8),
    "| Top of page rate:", r["Top of page rate"] ?? ""
  );
});

// ---------------------------------------------------------------------------
// 2. SEARCH TERMS — what queries triggered ads
// ---------------------------------------------------------------------------
console.log("\n===== SEARCH TERMS ANALYSIS =====");
const { rows: st } = parseReport("Search terms report.csv");
console.log("Total search terms:", st.length);

// Sort by impressions
st.sort((a, b) => Number(b["Impr."] ?? 0) - Number(a["Impr."] ?? 0));

console.log("\nTop 20 by impressions:");
console.log("Search term".padEnd(40), "Impr".padEnd(7), "Clicks".padEnd(7), "CTR".padEnd(8), "Status");
st.slice(0, 20).forEach(r => {
  const ctr = parseFloat(r["CTR"] ?? 0);
  const flag = ctr < 1 ? "⚠️ LOW" : ctr >= 5 ? "✅ HIGH" : "OK";
  console.log(
    (r["Search term"] ?? "").slice(0, 39).padEnd(40),
    String(r["Impr."] ?? "").padEnd(7),
    String(r["Clicks"] ?? "").padEnd(7),
    (r["CTR"] ?? "").padEnd(8),
    flag
  );
});

// Low CTR terms (potential irrelevant traffic)
const lowCtr = st.filter(r => parseFloat(r["CTR"] ?? 0) < 1 && Number(r["Impr."] ?? 0) > 50);
console.log(`\nLow CTR terms (<1% CTR with >50 impressions): ${lowCtr.length}`);
lowCtr.slice(0, 10).forEach(r => {
  console.log(" ", (r["Search term"] ?? "").slice(0, 45).padEnd(46), "Impr:", r["Impr."], "CTR:", r["CTR"], "Campaign:", (r["Campaign"] ?? "").slice(0, 30));
});

// High CTR terms (strong intent)
const highCtr = st.filter(r => parseFloat(r["CTR"] ?? 0) >= 10);
console.log(`\nHigh CTR terms (>=10% CTR): ${highCtr.length}`);
highCtr.slice(0, 10).forEach(r => {
  console.log(" ", (r["Search term"] ?? "").slice(0, 45).padEnd(46), "Impr:", r["Impr."], "CTR:", r["CTR"], "Conv:", r["Conversions"]);
});

// ---------------------------------------------------------------------------
// 3. LANDING PAGES — which URLs received traffic
// ---------------------------------------------------------------------------
console.log("\n===== LANDING PAGES =====");
const { rows: lp } = parseReport("Landing page report.csv");
lp.sort((a, b) => Number(b["Clicks"] ?? 0) - Number(a["Clicks"] ?? 0));
console.log("Landing page".padEnd(55), "Clicks".padEnd(8), "CTR".padEnd(8), "Mobile speed");
lp.slice(0, 10).forEach(r => {
  console.log(
    (r["Landing page"] ?? "").slice(0, 54).padEnd(55),
    String(r["Clicks"] ?? "").padEnd(8),
    String(r["CTR"] ?? "").padEnd(8),
    r["Mobile speed score"] ?? "n/a"
  );
});

// ---------------------------------------------------------------------------
// 4. DEVICE BREAKDOWN
// ---------------------------------------------------------------------------
console.log("\n===== DEVICE BREAKDOWN =====");
const { rows: dev } = parseReport("Device report.csv");
const devSum = {};
dev.forEach(r => {
  const d = r["Device"];
  if (!d) return;
  if (!devSum[d]) devSum[d] = { impr: 0, clicks: 0, cost: 0, conv: 0 };
  devSum[d].impr += Number(r["Impr."] ?? 0);
  devSum[d].clicks += Number(r["Clicks"] ?? 0) || Number(r["Interactions"] ?? 0);
  devSum[d].cost += Number(r["Cost"] ?? 0);
  devSum[d].conv += Number(r["Conversions"] ?? 0);
});
console.log("Device".padEnd(15), "Impressions".padEnd(12), "Clicks".padEnd(8), "CTR".padEnd(7), "Cost $".padEnd(10), "Conversions");
Object.entries(devSum).forEach(([d, v]) => {
  const ctr = v.impr > 0 ? (v.clicks / v.impr * 100).toFixed(2) + "%" : "0%";
  console.log(d.padEnd(15), String(v.impr).padEnd(12), String(v.clicks).padEnd(8), ctr.padEnd(7), ("$" + v.cost.toFixed(0)).padEnd(10), v.conv.toFixed(1));
});

// ---------------------------------------------------------------------------
// 5. AD PERFORMANCE — which ad copy worked
// ---------------------------------------------------------------------------
console.log("\n===== TOP ADS BY CONVERSIONS =====");
const { rows: ads } = parseReport("Ad report.csv");
ads.sort((a, b) => Number(b["Conversions"] ?? 0) - Number(a["Conversions"] ?? 0));
ads.slice(0, 10).forEach(r => {
  const h1 = r["Headline 1"] ?? r["Long headline"] ?? "";
  const h2 = r["Headline 2"] ?? "";
  if (!h1 && !r["Conversions"]) return;
  console.log(
    `  Headline: "${h1} | ${h2}"`.slice(0, 70).padEnd(72),
    "Conv:", String(r["Conversions"] ?? "0").padEnd(6),
    "CTR:", String(r["CTR"] ?? "").padEnd(7),
    "Campaign:", (r["Campaign"] ?? "").slice(0, 25)
  );
});
