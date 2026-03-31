import aliases from "../data/creator-aliases.json" with { type: "json" };

const aliasMap = aliases as Record<string, string>;

export function normalizeCreatorName(input: string): string {
  const normalized = input
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[　]/g, " ")
    .trim();

  return aliasMap[normalized] ?? normalized;
}

export function splitNames(input: string): string[] {
  return input
    .split(/[\/／,、・&＆]/)
    .map((part) => normalizeCreatorName(part))
    .filter((part) => part.length > 0);
}
