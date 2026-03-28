export type KeyValuePair = { key: string; value: string };

export function toKeyValuePairs(input?: Record<string, string> | null): KeyValuePair[] {
  return Object.entries(input ?? {}).map(([key, value]) => ({ key, value }));
}

export function fromKeyValuePairs(input: KeyValuePair[]): Record<string, string> {
  return input.reduce<Record<string, string>>((acc, item) => {
    const key = item.key.trim();
    if (!key) return acc;
    acc[key] = item.value;
    return acc;
  }, {});
}

export function compactObject<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      return true;
    }),
  ) as Partial<T>;
}
