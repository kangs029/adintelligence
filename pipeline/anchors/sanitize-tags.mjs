const DIRECT_CONTACT_TAG =
  /^(?:contact:|email$|fax$|mobile$|phone$)/iu;

export function sanitizePublicAnchorTags(tags = {}) {
  return Object.fromEntries(
    Object.entries(tags).filter(([key]) => !DIRECT_CONTACT_TAG.test(key)),
  );
}
