import { describe, expect, it } from 'vitest';

import {
  detectPlatformByUrlHint,
  normalizePlatformAlias,
  parseHttpUrlCandidate,
} from './platformIdentity.js';

describe('platformIdentity', () => {
  it('normalizes shared platform aliases', () => {
    expect(normalizePlatformAlias('chatgpt-codex')).toBe('codex');
    expect(normalizePlatformAlias('anti-gravity')).toBe('antigravity');
    expect(normalizePlatformAlias('one api')).toBe('one-api');
    expect(normalizePlatformAlias('axon-hub')).toBe('axonhub');
    expect(normalizePlatformAlias('orca-router')).toBe('orcarouter');
    expect(normalizePlatformAlias('orca router')).toBe('orcarouter');
    expect(normalizePlatformAlias('')).toBe('');
  });

  it('detects platform by well-known url hints', () => {
    expect(detectPlatformByUrlHint('https://api.openai.com/v1/models')).toBe('openai');
    expect(detectPlatformByUrlHint('https://qianfan.baidubce.com/v2/coding')).toBe('openai');
    expect(detectPlatformByUrlHint('https://qianfan.baidubce.com/anthropic/coding')).toBe('claude');
    expect(detectPlatformByUrlHint('https://chatgpt.com/backend-api/codex')).toBe('codex');
    expect(detectPlatformByUrlHint('https://api.anthropic.com/v1/messages')).toBe('claude');
    expect(detectPlatformByUrlHint('https://generativelanguage.googleapis.com/v1beta')).toBe('gemini');
    expect(detectPlatformByUrlHint('https://cloudcode-pa.googleapis.com')).toBe('gemini-cli');
    expect(detectPlatformByUrlHint('http://127.0.0.1:8317/v1/models')).toBe('cliproxyapi');
    expect(detectPlatformByUrlHint('https://hub.linux.do/v1/models')).toBe('axonhub');
    expect(detectPlatformByUrlHint('https://evil.example.com/?next=https://api.openai.com/v1/models')).toBeUndefined();
  });

  it('recognizes only exact official HTTPS OrcaRouter hostnames', () => {
    expect(detectPlatformByUrlHint('https://api.orcarouter.ai/v1')).toBe('orcarouter');
    expect(detectPlatformByUrlHint('api.orcarouter.ai/v1')).toBe('orcarouter');
    expect(detectPlatformByUrlHint('http://api.orcarouter.ai/v1')).toBeUndefined();
    expect(detectPlatformByUrlHint('https://evil-api.orcarouter.ai/v1')).toBeUndefined();
    expect(detectPlatformByUrlHint('https://api.orcarouter.ai.attacker.test/v1')).toBeUndefined();
    expect(detectPlatformByUrlHint('https://attacker.test/api.orcarouter.ai')).toBeUndefined();
    expect(detectPlatformByUrlHint('https://api.orcarouter.ai@attacker.test/v1')).toBeUndefined();
    expect(detectPlatformByUrlHint('https://attacker.test/?next=api.orcarouter.ai')).toBeUndefined();
    expect(detectPlatformByUrlHint('ftp://api.orcarouter.ai/v1')).toBeUndefined();
    expect(detectPlatformByUrlHint('file:///api.orcarouter.ai/v1')).toBeUndefined();
  });

  it.each([
    ['https://api.openai.com/v1', 'openai'],
    ['api.openai.com/v1', 'openai'],
    ['https://api.anthropic.com/v1/messages', 'claude'],
    ['https://generativelanguage.googleapis.com/v1beta', 'gemini'],
    ['https://foo.googleapis.com/v1beta/openai', 'gemini'],
    ['https://cloudcode-pa.googleapis.com', 'gemini-cli'],
  ] as const)('detects safe provider URL %s', (url, expected) => {
    expect(detectPlatformByUrlHint(url)).toBe(expected);
  });

  it.each([
    'https://notaxonhub.example/v1',
    'https://axonhub.attacker.test/v1',
  ])('rejects AxonHub look-alike hostname %s', (url) => {
    expect(detectPlatformByUrlHint(url)).toBeUndefined();
  });

  it.each([
    'https://api.openai.com.attacker.test/',
    'https://attacker.test/api.openai.com/v1',
    'https://api.openai.com@attacker.test/',
    'https://api.anthropic.com.attacker.test/',
    'https://attacker.test/anthropic.com/v1',
    'https://generativelanguage.googleapis.com.attacker.test/',
    'https://attacker.test/gemini.google.com',
    'https://foo.googleapis.com.attacker.test/v1beta/openai',
    'https://foo.googleapis.com/v1beta/openai-evil',
    'javascript://api.openai.com',
  ] as const)('rejects provider text outside a safe HTTP URL identity: %s', (url) => {
    expect(detectPlatformByUrlHint(url)).toBeUndefined();
  });

  it.each([
    ['https://qianfan.baidubce.com/v2/coding/models', 'openai'],
    ['https://qianfan.baidubce.com/anthropic/coding/messages', 'claude'],
    ['https://chatgpt.com/backend-api/codex/responses', 'codex'],
    ['https://anthropic.com/v1/messages', 'claude'],
    ['https://foo.googleapis.com/v1beta/openai/chat/completions', 'gemini'],
  ] as const)('accepts provider paths on segment boundaries: %s', (url, expected) => {
    expect(detectPlatformByUrlHint(url)).toBe(expected);
  });

  it('parses only HTTP(S) URL candidates', () => {
    expect(parseHttpUrlCandidate('https://api.openai.com/v1')?.hostname).toBe('api.openai.com');
    expect(parseHttpUrlCandidate('api.openai.com/v1')?.protocol).toBe('https:');
    expect(parseHttpUrlCandidate('ftp://api.openai.com/v1')).toBeNull();
    expect(parseHttpUrlCandidate('javascript://api.openai.com')).toBeNull();
    expect(parseHttpUrlCandidate('https://api.openai.com@attacker.test')?.hostname).toBe('attacker.test');
  });

  it.each([
    ['https://anyrouter.top', 'anyrouter'],
    ['https://demo.donehub.example', 'done-hub'],
    ['https://console.one-hub.example', 'one-hub'],
    ['https://antigravity.example', 'antigravity'],
    ['https://console.cliproxyapi.example', 'cliproxyapi'],
    ['https://sub2api.example.com', 'sub2api'],
    ['http://localhost:8317/v1/models', 'cliproxyapi'],
    ['http://127.0.0.1:8317/v1/models', 'cliproxyapi'],
  ] as const)('preserves parsed hostname or port hint %s', (url, expected) => {
    expect(detectPlatformByUrlHint(url)).toBe(expected);
  });

  it.each([
    ['https://attacker.test/path/anyrouter', 'anyrouter'],
    ['https://attacker.test/?next=one-hub', 'one-hub'],
    ['https://attacker.test/#done-hub', 'done-hub'],
    ['https://antigravity@attacker.test/', 'antigravity'],
    ['https://attacker.test/path/cliproxy', 'cliproxyapi'],
    ['https://attacker.test/?next=sub2api', 'sub2api'],
  ] as const)('does not use branded text outside parsed host or port: %s', (url, _text) => {
    expect(detectPlatformByUrlHint(url)).toBeUndefined();
  });

  it.each([
    ['https://attacker.test/#api.openai.com/v1', 'openai'],
    ['https://attacker.test/path/chatgpt.com/backend-api/codex', 'codex'],
    ['https://api.openai.com@attacker.test/', 'openai'],
  ] as const)('does not use canonical provider text outside identity fields: %s', (url, _platform) => {
    expect(detectPlatformByUrlHint(url)).toBeUndefined();
  });

  it.each([
    'https://qianfan.baidubce.com/v2/coding-evil',
    'https://qianfan.baidubce.com/anthropic/coding-evil',
    'https://chatgpt.com/backend-api/codex-evil',
    'https://anthropic.com/v1-evil',
    'https://foo.googleapis.com/v1beta/openai-evil',
  ] as const)('rejects provider paths without segment boundaries: %s', (url) => {
    expect(detectPlatformByUrlHint(url)).toBeUndefined();
  });
});
