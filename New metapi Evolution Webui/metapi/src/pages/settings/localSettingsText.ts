import { useLang } from '../../contexts/LangContext';
export function useLocalSettingsText() {
  const {lang} = useLang();
  return (en: string, hant: string, hans: string) => lang === 'zh-Hant' ? hant : lang === 'zh-Hans' ? hans : en;
}
