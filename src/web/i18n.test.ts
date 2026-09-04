import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translateText } from './i18n.js';

const HAS_HAN_RE = /[㐀-鿿]/;

function collectSourceChineseStrings(rootDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const filePath = join(dir, entry);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        walk(filePath);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(entry)) continue;
      if (/\.test\.(tsx|ts)$/.test(entry)) continue;
      if (entry.startsWith('i18n')) continue;
      files.push(filePath);
    }
  }

  walk(rootDir);

  const values: string[] = [];
  const seen = new Set<string>();

  function add(filePath: string, raw: string | undefined) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text || !HAS_HAN_RE.test(text)) return;
    if (text.length > 260) return;
    if (/[<>]/.test(text)) return;
    const key = `${relative(rootDir, filePath)}\t${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    values.push(text);
  }

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function visit(node: ts.Node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        add(filePath, node.text);
      } else if (ts.isJsxText(node)) {
        add(filePath, node.getText(sourceFile));
      } else if (ts.isTemplateExpression(node)) {
        add(filePath, node.head.text);
        for (const span of node.templateSpans) {
          add(filePath, span.literal.text);
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

describe('translateText', () => {
  it('keeps zh text unchanged in zh mode', () => {
    expect(translateText('模型广场', 'zh')).toBe('模型广场');
  });

  it('translates exact key in en mode', () => {
    expect(translateText('模型广场', 'en')).toBe('Model Marketplace');
  });

  it('supports phrase replacement for mixed text', () => {
    expect(translateText('覆盖槽位 3', 'en')).toBe('Coverage Slots 3');
    expect(translateText('共 12 个模型', 'en')).toBe('Total 12 models');
  });

  it('keeps vendor names when translating site initialization preset labels', () => {
    const labels = [
      ['阿里云 CodingPlan / OpenAI', 'Alibaba Cloud Coding Plan / OpenAI'],
      ['阿里云 CodingPlan / Claude', 'Alibaba Cloud Coding Plan / Claude'],
      ['智谱 Coding Plan / OpenAI', 'Zhipu Coding Plan / OpenAI'],
      ['智谱 Coding Plan / Claude', 'Zhipu Coding Plan / Claude'],
      ['百度 CodingPlan / OpenAI', 'Baidu Coding Plan / OpenAI'],
      ['百度 CodingPlan / Claude', 'Baidu Coding Plan / Claude'],
      ['豆包 Coding Plan / OpenAI', 'Doubao Coding Plan / OpenAI'],
    ] as const;

    for (const [source, expected] of labels) {
      expect(translateText(source, 'en')).toBe(expected);
    }
  });

  it('never returns Chinese characters in strict en mode', () => {
    const samples = [
      '站点已禁用',
      '缓存清理后重建失败：unknown error',
      '签到任务执行中，请稍后查看签到日志',
    ];

    for (const sample of samples) {
      expect(translateText(sample, 'en')).not.toMatch(/[㐀-鿿]/);
    }
  });

  it('uses concrete english translations instead of fallback for common runtime text', () => {
    expect(translateText('切换到中文', 'en')).toBe('Switch to Chinese');
    expect(translateText('中', 'en')).toBe('ZH');

    const samples = [
      '站点已禁用',
      '签到任务执行中，请稍后查看签到日志',
      '下游访问令牌至少 6 位（含 sk-）',
      '路由重建任务执行中，请稍后查看程序日志',
    ];

    for (const sample of samples) {
      const translated = translateText(sample, 'en');
      expect(translated).not.toBe('Untranslated');
      expect(translated).not.toMatch(/[㐀-鿿]/);
    }
  });

  it('translates all current web source Chinese UI literals in strict English mode', () => {
    const webRoot = join(process.cwd(), 'src/web');
    if (!existsSync(webRoot)) return;

    const samples = collectSourceChineseStrings(webRoot);
    const unresolved = samples
      .map((sample) => ({ sample, translated: translateText(sample, 'en') }))
      .filter(({ translated }) => translated === 'Untranslated' || HAS_HAN_RE.test(translated));

    expect(unresolved).toEqual([]);
  });
});
