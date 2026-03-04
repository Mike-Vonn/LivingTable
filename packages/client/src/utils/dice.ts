export interface ParsedDice {
  count: number;
  sides: number;
  modifier: number;
  keepHighest?: number;
  keepLowest?: number;
}

export function parseDiceExpression(expr: string): ParsedDice | null {
  const match = expr.trim().match(/^(\d+)d(\d+)(?:kh(\d+))?(?:kl(\d+))?(?:([+-]\d+))?$/i);
  if (!match) return null;

  return {
    count: parseInt(match[1]),
    sides: parseInt(match[2]),
    keepHighest: match[3] ? parseInt(match[3]) : undefined,
    keepLowest: match[4] ? parseInt(match[4]) : undefined,
    modifier: match[5] ? parseInt(match[5]) : 0,
  };
}

export function rollDice(parsed: ParsedDice): { results: number[]; total: number } {
  const results: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    results.push(Math.floor(Math.random() * parsed.sides) + 1);
  }

  let kept = [...results];
  if (parsed.keepHighest !== undefined) {
    kept.sort((a, b) => b - a);
    kept = kept.slice(0, parsed.keepHighest);
  } else if (parsed.keepLowest !== undefined) {
    kept.sort((a, b) => a - b);
    kept = kept.slice(0, parsed.keepLowest);
  }

  const total = kept.reduce((sum, v) => sum + v, 0) + parsed.modifier;
  return { results, total };
}
