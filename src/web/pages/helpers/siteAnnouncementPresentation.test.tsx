import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SiteAnnouncementContent,
  formatSiteAnnouncementSeenAt,
  readClientTimeZone,
  renderSiteAnnouncementHtml,
  resolveSiteAnnouncementTimeZone,
} from './siteAnnouncementPresentation.js';

const hasDomSanitizerSupport = typeof DOMParser === 'function' && typeof Node !== 'undefined';
const itWithDomSupport = hasDomSanitizerSupport ? it : it.skip;
const itWithoutDomSupport = hasDomSanitizerSupport ? it.skip : it;

describe('siteAnnouncementPresentation helpers', () => {
  itWithoutDomSupport('escapes raw announcement markup when DOM parsing is unavailable', () => {
    const payload = [
      '<scr<script>removed</script>ipt>alert(1)</script>',
      '<sty<style>removed</style>le>body{display:none}</style>',
      '<img src=x onerror=alert(1)>',
    ].join('\n');

    const html = renderSiteAnnouncementHtml(payload);

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;scr&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  itWithoutDomSupport('escapes malformed closing tags when DOM parsing is unavailable', () => {
    expect(renderSiteAnnouncementHtml('<script>alert(1)</script >')).toContain('&lt;script&gt;');
  });

  itWithDomSupport('renders sanitized html notices with safe links', () => {
    const markup = renderToStaticMarkup(
      <SiteAnnouncementContent
        content={[
          '<h2>Notice</h2>',
          '<p>Welcome <strong>back</strong>.</p>',
          '<script>alert(1)</script>',
          '<a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
          '<a href="https://example.com/docs" target="_blank">docs</a>',
        ].join('')}
      />,
    );

    expect(markup).toContain('<h2>Notice</h2>');
    expect(markup).toContain('<strong>back</strong>');
    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('onclick=');
    expect(markup).not.toContain('javascript:alert');
    expect(markup).toContain('href="https://example.com/docs"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  itWithDomSupport('rejects hostile DOM sanitizer payloads while preserving safe links', () => {
    const payload = [
      '<script>alert(1)</script>',
      '<style>body{display:none}</style>',
      '<img src="https://example.com/a.png" onerror="alert(1)">',
      '<a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
      '<a href="https://example.com/safe">safe</a>',
      '<iframe src="https://attacker.test"></iframe>',
    ].join('');

    const markup = renderToStaticMarkup(
      <SiteAnnouncementContent content={payload} />,
    );

    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('<style');
    expect(markup).not.toContain('<iframe');
    expect(markup).not.toContain('onerror=');
    expect(markup).not.toContain('onclick=');
    expect(markup).not.toContain('href="javascript:alert(1)"');
    expect(markup).toContain('href="https://example.com/safe"');
  });

  itWithDomSupport('renders markdown notices as structured content', () => {
    const markup = renderToStaticMarkup(
      <SiteAnnouncementContent
        content={[
          '# README.md',
          '',
          '这是一个 [接入文档](https://example.com/setup)。',
          '',
          '```json',
          '{',
          '  "model": "gpt-5.4"',
          '}',
          '```',
        ].join('\n')}
      />,
    );

    expect(markup).toContain('<h1>README.md</h1>');
    expect(markup).toContain('href="https://example.com/setup"');
    expect(markup).toContain('<pre><code class="language-json">');
    expect(markup).toContain('&quot;model&quot;: &quot;gpt-5.4&quot;');
  });

  itWithDomSupport('sanitizes markdown links and raw html while escaping fenced tags', () => {
    const markdownMarkup = renderSiteAnnouncementHtml('[bad](javascript:alert(1))');
    const rawHtmlMarkup = renderSiteAnnouncementHtml('<script>alert(1)</script>');
    const fencedMarkup = renderSiteAnnouncementHtml([
      '```html',
      '<script>literal code</script>',
      '```',
    ].join('\n'));

    const markdownContainer = document.createElement('div');
    markdownContainer.innerHTML = markdownMarkup;
    expect(markdownContainer.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(markdownMarkup).not.toContain('href="javascript:alert(1)"');

    expect(rawHtmlMarkup).not.toContain('<script');

    const fencedContainer = document.createElement('div');
    fencedContainer.innerHTML = fencedMarkup;
    const fencedCode = fencedContainer.querySelector('pre > code');
    expect(fencedContainer.querySelector('script')).toBeNull();
    expect(fencedCode?.textContent ?? '').toContain(
      '<script>literal code</script>',
    );
    expect(fencedMarkup).toContain('<pre><code class="language-html">');
    expect(fencedMarkup).toContain('&lt;script&gt;literal code&lt;/script&gt;');
  });

  itWithDomSupport('keeps hostile announcement markup out of the html sink', () => {
    const payload = [
      '<script>alert(1)</script>',
      '<style>body{display:none}</style>',
      '<img src="https://example.com/a.png" onerror="alert(1)">',
      '<a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
      '<a href="https://example.com/safe">safe</a>',
      '<iframe src="https://attacker.test"></iframe>',
    ].join('');
    const container = document.createElement('div');

    container.innerHTML = renderSiteAnnouncementHtml(payload);

    expect(container.querySelector('script, style, iframe, object, embed')).toBeNull();
    expect(container.querySelector('[onclick], [onerror]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('a[href="https://example.com/safe"]')).not.toBeNull();
  });

  it('formats first-seen time in the requested local timezone', () => {
    expect(formatSiteAnnouncementSeenAt('2026-03-20 04:23:27', 'Asia/Shanghai')).toBe('2026/03/20 12:23:27');
  });

  it('prefers client timezone over server timezone', () => {
    expect(resolveSiteAnnouncementTimeZone('Asia/Shanghai', 'UTC')).toBe('Asia/Shanghai');
    expect(resolveSiteAnnouncementTimeZone('', 'UTC')).toBe('UTC');
  });

  it('reads the browser timezone when available', () => {
    expect(readClientTimeZone()).toBeTruthy();
  });
});
