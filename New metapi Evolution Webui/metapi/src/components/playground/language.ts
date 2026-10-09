import { translateText } from '../../../../../src/web/i18n';
import type { Lang } from '../../i18n/dicts';

// Legacy tester labels are source text, not new-shell dictionary keys. Reuse
// its established English translations and keep translation inside this island.
const traditionalCharacters: Record<string, string> = {
  '测': '測', '试': '試', '设': '設', '置': '置', '调': '調', '显': '顯', '隐': '隱', '藏': '藏',
  '请': '請', '选': '選', '择': '擇', '协': '協', '议': '議', '输': '輸', '会': '會', '话': '話',
  '对': '對', '开': '開', '启': '啟', '关': '關', '闭': '閉', '发': '發', '送': '送',
  '参': '參', '数': '數', '采': '採', '样': '樣', '温': '溫', '频': '頻', '罚': '罰', '机': '機',
  '种': '種', '载': '載', '复': '複', '制': '製', '删': '刪', '编': '編', '辑': '輯', '仅': '僅',
  '图': '圖', '视': '視', '检': '檢', '查': '查', '询': '詢', '无': '無', '暂': '暫', '结': '結',
  '过': '過', '为': '為', '务': '務', '态': '態', '恢': '恢', '传': '傳', '连': '連', '断': '斷',
  '错': '錯', '误': '誤', '败': '敗', '读': '讀', '写': '寫', '块': '塊', '应': '應', '体': '體',
  '证': '證', '效': '效', '拦': '攔', '截': '截', '换': '換', '实': '實', '际': '際', '供': '供',
  '商': '商', '站': '站', '点': '點', '认': '認', '独': '獨', '将': '將', '录': '錄', '标': '標',
  '签': '籤', '当': '當', '筛': '篩', '个': '個', '匹': '匹', '约': '約', '束': '束', '扩': '擴',
  '压': '壓', '缩': '縮', '质': '質', '量': '量', '风': '風', '格': '格', '背': '背', '审': '審',
  '核': '核', '户': '戶', '带': '帶', '宽': '寬', '长': '長', '轻': '輕', '预': '預', '览': '覽',
  '时': '時', '间': '間', '线': '線', '异': '異', '步': '步', '还': '還', '则': '則', '后': '後',
  '经': '經', '获': '獲', '取': '取', '据': '據', '执': '執', '进': '進', '围': '圍', '处': '處',
  '组': '組', '储': '儲', '存': '存', '头': '頭', '额': '額', '并': '並', '这': '這', '与': '與',
  '码': '碼', '键': '鍵', '盘': '盤', '转': '轉', '义': '義', '补': '補',
  '单': '單', '条': '條', '逗': '逗', '号': '號', '总': '總', '乐': '樂', '细': '細', '节': '節',
  '叠': '疊', '确': '確', '导': '導', '入': '入', '顺': '順', '觉': '覺',
};

export function translateTesterText(text: string, lang: Lang): string {
  if (lang === 'en') return translateText(text, 'en');
  if (lang === 'zh-Hans') return text;
  return [...text].map((char) => traditionalCharacters[char] ?? char).join('');
}

export function localizeTesterSurface(root: HTMLElement, lang: Lang) {
  const originals = new WeakMap<Node, { source: string; rendered: string }>();
  const attributes = new WeakMap<Element, Map<string, { source: string; rendered: string }>>();
  const skip = 'script,style,code,pre,kbd,samp,[data-model-tester-output]';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.closest(skip) || node.parentElement.isContentEditable) return;
      const value = node.nodeValue || '';
      const cached = originals.get(node);
      const source = cached && value === cached.rendered ? cached.source : value;
      const rendered = translateTesterText(source, lang);
      originals.set(node, { source, rendered });
      if (value !== rendered) node.nodeValue = rendered;
      return;
    }
    if (!(node instanceof Element) || node.matches(skip)) return;
    const map = attributes.get(node) ?? new Map();
    attributes.set(node, map);
    for (const name of ['placeholder', 'title', 'aria-label']) {
      const value = node.getAttribute(name);
      if (!value) continue;
      const cached = map.get(name);
      const source = cached && value === cached.rendered ? cached.source : value;
      const rendered = translateTesterText(source, lang);
      map.set(name, { source, rendered });
      if (value !== rendered) node.setAttribute(name, rendered);
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'childList') for (const node of Array.from(record.addedNodes)) walk(node);
      else walk(record.target);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  return () => {
    observer.disconnect();
    // Restore source text before re-localizing in a different host language.
    const restore = (node: Node) => {
      const cached = originals.get(node);
      if (cached && node.nodeValue === cached.rendered) node.nodeValue = cached.source;
      if (node instanceof Element) {
        for (const [name, value] of attributes.get(node) ?? []) {
          if (node.getAttribute(name) === value.rendered) node.setAttribute(name, value.source);
        }
      }
      for (const child of Array.from(node.childNodes)) restore(child);
    };
    restore(root);
  };
}
