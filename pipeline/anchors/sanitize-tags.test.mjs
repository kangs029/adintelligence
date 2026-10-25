import { describe, expect, it } from "vitest";

import { sanitizePublicAnchorTags } from "./sanitize-tags.mjs";

describe("sanitizePublicAnchorTags", () => {
  it("removes direct-contact fields while preserving evidence tags", () => {
    expect(
      sanitizePublicAnchorTags({
        "addr:city": "Sunnyvale",
        "contact:email": "public@example.com",
        "contact:facebook": "example-page",
        "contact:phone": "+1 555 0100",
        email: "public@example.com",
        fax: "+1 555 0101",
        mobile: "+1 555 0102",
        name: "Example Temple",
        phone: "+1 555 0103",
        religion: "hindu",
        website: "https://example.com",
      }),
    ).toEqual({
      "addr:city": "Sunnyvale",
      name: "Example Temple",
      religion: "hindu",
      website: "https://example.com",
    });
  });
});
