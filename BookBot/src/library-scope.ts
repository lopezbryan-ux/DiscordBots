// Books and ratings use the library's owner ID; polls always use the actual server ID.
export function getLibraryGuildId(guildId: string | null): string | null {
  const value = process.env.BOOK_LIBRARY_ALIASES;
  if (!value) return guildId;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "BOOK_LIBRARY_ALIASES must be a JSON object mapping server IDs to library owner server IDs.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "BOOK_LIBRARY_ALIASES must be a JSON object mapping server IDs to library owner server IDs.",
    );
  }

  const entries = Object.entries(parsed);
  if (
    entries.some(
      ([serverId, ownerId]) =>
        !/^\d{17,20}$/.test(serverId) ||
        typeof ownerId !== "string" ||
        !/^\d{17,20}$/.test(ownerId),
    )
  ) {
    throw new Error(
      "BOOK_LIBRARY_ALIASES keys and values must be Discord server IDs.",
    );
  }
  const aliases = new Map(entries as [string, string][]);
  if (
    entries.some(
      ([, ownerId]) => aliases.has(ownerId) && aliases.get(ownerId) !== ownerId,
    )
  ) {
    throw new Error(
      "BOOK_LIBRARY_ALIASES must point directly to library owners, without alias chains or cycles.",
    );
  }
  return guildId === null ? null : (aliases.get(guildId) ?? guildId);
}
