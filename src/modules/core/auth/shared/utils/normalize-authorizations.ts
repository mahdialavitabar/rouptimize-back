export function normalizeAuthorizations(authorizations: unknown): string[] {
  if (Array.isArray(authorizations)) {
    return authorizations
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
  }

  if (typeof authorizations === 'string') {
    return authorizations
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  return [];
}
