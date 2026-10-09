import { useLang } from "../../contexts/LangContext";
/** Domain-local labels are selected at render time; API state never stores translations. */
export function useObservationLabels() {
  const { lang } = useLang();
  return (en: string, hant: string, hans: string = hant) => lang === "en" ? en : lang === "zh-Hant" ? hant : hans;
}
