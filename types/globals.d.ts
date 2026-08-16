/* Global declarations for the SS_* globals that the runtime IIFE files
   consume from the shared UMD modules (loaded via content_scripts[] order
   and <script> tags). This is a script-context .d.ts (top-level `declare
   var`), NOT `declare global`. Shapes mirror shared/pattern-data.js,
   shared/constants.js, and shared/post-container.js exports. */

declare var SS_CONSTANTS: {
  PHRASES_STORAGE_KEY: string;
  STORAGE_KEYS: Record<string, string>;
  LIMITS: {
    MAX_CUSTOM_PHRASES: number;
    MAX_PHRASE_LENGTH: number;
    MAX_WHITELIST: number;
    MAX_BLOCKED_AUTHORS: number;
    MAX_IMPORT_BYTES: number;
    SNOOZE_DURATION_MS: number;
    MAX_EXCLUDED_ITEMS: number;
  };
  DEFAULT_ENABLED_LANGS: readonly string[];
};

declare var SS_PATTERN_DATA: Record<
  string,
  ReadonlyArray<{ id: string; regex: RegExp; label: string }>
>;

declare function SS_buildPatterns(
  phrases: Array<{ text: string; enabled?: boolean; mode?: string }>,
  langs: readonly string[],
  disabledPatterns: ReadonlySet<string>,
  maxPhraseLength: number,
): Array<{ regex: RegExp; label: string; source: string }>;

declare var SS_PROMOTED_LABELS: readonly string[];
declare var SS_FEATURED_LABELS: readonly string[];

declare function SS_matchesLabel(
  text: string,
  labels: readonly string[],
): boolean;

declare function SS_escapeRegex(str: string): string;
declare function SS_isLinkedInHost(hostname: string): boolean;
declare function SS_parseAuthorId(
  href: string,
  baseOrigin?: string,
): string | null;
declare function SS_hashString(value: string): string;
declare function SS_getExcludedSignature(text: string): string;
declare function SS_getLocalDayKey(date?: Date): string;
declare function SS_createCooldownStore(
  expiryMs: number,
  maxEntries: number,
): { has(key: string): boolean; set(key: string): void };

declare function SS_estimateEntriesBytes(
  map: Map<string, { preview: string | null; created: number | null }>,
  storageKey: string,
): number;
declare function SS_pruneExcludedByBytes(
  map: Map<string, { preview: string | null; created: number | null }>,
  storageKey: string,
  safeByteLimit: number,
): void;

declare function SS_findBySiblingHeuristic(
  textNode: Node,
  ...args: any[]
): Element | null;
declare function SS_findByKnownSelectors(
  textNode: Node,
  ...args: any[]
): Element | null;
declare function SS_findPostContainer(
  textNode: Node,
  config: any,
  postSelectors: readonly string[],
  doc?: Document,
): Element | null;
