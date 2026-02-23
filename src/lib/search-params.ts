export type SearchParamsMap = Record<string, string | string[] | undefined>;

export const readSearchParam = (searchParams: SearchParamsMap, key: string): string => {
  const value = searchParams[key];
  return typeof value === "string" ? value : "";
};

export const hasSearchFlag = (searchParams: SearchParamsMap, key: string, expected = "1"): boolean => {
  return readSearchParam(searchParams, key) === expected;
};

export const readSearchParamNumber = (searchParams: SearchParamsMap, key: string): number | null => {
  const value = readSearchParam(searchParams, key);

  if (value.length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
