export const competitorProfiles = [
  {
    competitor: "Xpat",
    domain: "xpat.money",
    googleSearches: [
      {
        label: "Remit2Any Inc advertiser",
        url: "https://adstransparency.google.com/advertiser/AR05946074718833475585?region=US",
      },
      { domain: "xpat.money", label: "xpat.money domain" },
      { domain: "remit2any.com", label: "remit2any.com domain" },
    ],
    landingPageUrl: "https://xpat.money/",
    metaAdvertiserNames: ["Xpat", "Xpat Events", "Xpat.money", "Remit2Any"],
    metaQueries: ["Xpat money transfer", "xpat money", "Remit2Any"],
    query: "Xpat money transfer",
    slug: "xpat",
  },
  {
    competitor: "Remitly",
    domain: "remitly.com",
    landingPageUrl: "https://www.remitly.com/us/en/india",
    metaAdvertiserNames: ["Remitly"],
    query: "Remitly",
    slug: "remitly",
  },
  {
    competitor: "Wise",
    domain: "wise.com",
    landingPageUrl: "https://wise.com/us/send-money/send-money-to-india",
    metaAdvertiserNames: ["Wise"],
    query: "Wise money transfer",
    slug: "wise",
  },
  {
    competitor: "Xoom",
    domain: "xoom.com",
    landingPageUrl: "https://www.xoom.com/india/send-money",
    metaAdvertiserNames: ["Xoom", "Xoom, a PayPal Service", "PayPal"],
    query: "Xoom money transfer",
    slug: "xoom",
  },
  {
    competitor: "Western Union",
    domain: "westernunion.com",
    landingPageUrl: "https://www.westernunion.com/us/en/send-money-to-india.html",
    metaAdvertiserNames: ["Western Union"],
    query: "Western Union money transfer",
    slug: "western-union",
  },
  {
    competitor: "Aspora",
    domain: "aspora.com",
    landingPageUrl: "https://www.aspora.com/us",
    query: "Aspora money transfer India",
    slug: "aspora",
  },
  {
    competitor: "Crobo",
    domain: "crobo.money",
    landingPageUrl: "https://www.crobo.money/",
    query: "Crobo money transfer India",
    slug: "crobo",
  },
];

export function dateStamp(value) {
  return String(value).slice(0, 10);
}
