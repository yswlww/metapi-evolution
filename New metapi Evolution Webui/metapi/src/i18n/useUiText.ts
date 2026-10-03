import { useCallback } from "react";
import { useLang } from "../contexts/LangContext";
import { PROTOTYPE_DICTS } from "./prototypeDicts";

/**
 * Returns a translate function scoped to the prototype UI dictionary.
 * Interpolates {placeholders} from an optional params object.
 */
export function useUiText() {
  const { lang } = useLang();

  return useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const dict = PROTOTYPE_DICTS[lang] ?? PROTOTYPE_DICTS.en;
      let text = dict[key] ?? PROTOTYPE_DICTS.en[key] ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [lang],
  );
}
