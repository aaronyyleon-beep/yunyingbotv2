const normalizeStringValue = (value: unknown): string => String(value).trim().replace(/^\[+|\]+$/g, "").trim();

export const parseJsonArray = (value: unknown): string[] => {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => normalizeStringValue(item)).filter((item) => item.length > 0);
  } catch {
    return [];
  }
};

export const parseJsonObject = <T>(value: unknown): T | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};
