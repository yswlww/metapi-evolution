import { describe, expect, it } from 'vitest';

import {
  detectSiteInitializationPreset,
  getSiteInitializationPreset,
  listSiteInitializationPresets,
} from './siteInitializationPresets.js';

describe('siteInitializationPresets', () => {
  it('only opts known native image endpoints into a provider', () => {
    expect(getSiteInitializationPreset('minimax-openai')?.imageProvider).toBe('minimax');
    expect(getSiteInitializationPreset('minimax-claude')?.imageProvider).toBeUndefined();
    expect(getSiteInitializationPreset('codingplan-openai')?.imageProvider).toBeUndefined();
  });

  it('exposes vendor presets with recommended API-key-first initialization', () => {
    const presetIds = listSiteInitializationPresets().map((preset) => preset.id);
    expect(presetIds).toEqual(expect.arrayContaining([
      'codingplan-openai',
      'codingplan-claude',
      'zhipu-coding-plan-openai',
      'zhipu-coding-plan-claude',
      'deepseek-openai',
      'deepseek-claude',
      'moonshot-openai',
      'moonshot-claude',
      'minimax-openai',
      'minimax-claude',
      'modelscope-openai',
      'modelscope-claude',
      'doubao-coding-openai',
      'baidu-codingplan-openai',
      'baidu-codingplan-claude',
    ]));

    const openaiPreset = getSiteInitializationPreset('codingplan-openai');
    expect(openaiPreset).toMatchObject({
      id: 'codingplan-openai',
      platform: 'openai',
      defaultUrl: 'https://coding.dashscope.aliyuncs.com/v1',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(openaiPreset?.recommendedModels).toEqual(expect.arrayContaining(['qwen3-coder-plus', 'qwen3.5-plus']));

    const claudePreset = getSiteInitializationPreset('codingplan-claude');
    expect(claudePreset).toMatchObject({
      id: 'codingplan-claude',
      platform: 'claude',
      defaultUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(claudePreset?.recommendedModels).toEqual(expect.arrayContaining(['qwen3-coder-next', 'glm-5']));

    const zhipuOpenAiPreset = getSiteInitializationPreset('zhipu-coding-plan-openai');
    expect(zhipuOpenAiPreset).toMatchObject({
      id: 'zhipu-coding-plan-openai',
      platform: 'openai',
      defaultUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(zhipuOpenAiPreset?.recommendedModels).toEqual(['glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4.5-air']);

    const zhipuClaudePreset = getSiteInitializationPreset('zhipu-coding-plan-claude');
    expect(zhipuClaudePreset).toMatchObject({
      id: 'zhipu-coding-plan-claude',
      platform: 'claude',
      defaultUrl: 'https://open.bigmodel.cn/api/anthropic',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(zhipuClaudePreset?.recommendedModels).toEqual(['glm-4.7', 'glm-4.6', 'glm-4.5', 'glm-4.5-air']);

    const deepseekPreset = getSiteInitializationPreset('deepseek-openai');
    expect(deepseekPreset).toMatchObject({
      id: 'deepseek-openai',
      platform: 'openai',
      defaultUrl: 'https://api.deepseek.com/v1',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(deepseekPreset?.recommendedModels).toEqual(['deepseek-chat', 'deepseek-reasoner']);

    const moonshotPreset = getSiteInitializationPreset('moonshot-openai');
    expect(moonshotPreset).toMatchObject({
      id: 'moonshot-openai',
      platform: 'openai',
      defaultUrl: 'https://api.moonshot.cn/v1',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(moonshotPreset?.recommendedModels).toEqual(['kimi-k2.5', 'kimi-k2', 'kimi-k2-thinking']);

    const minimaxPreset = getSiteInitializationPreset('minimax-claude');
    expect(minimaxPreset).toMatchObject({
      id: 'minimax-claude',
      platform: 'claude',
      defaultUrl: 'https://api.minimaxi.com/anthropic',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(minimaxPreset?.recommendedModels).toEqual(['MiniMax-M2.7', 'MiniMax-M2.5', 'MiniMax-M2.1']);

    const modelscopePreset = getSiteInitializationPreset('modelscope-openai');
    expect(modelscopePreset).toMatchObject({
      id: 'modelscope-openai',
      platform: 'openai',
      defaultUrl: 'https://api-inference.modelscope.cn/v1',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(modelscopePreset?.recommendedModels).toEqual([
      'Qwen/Qwen3-32B',
      'Qwen/Qwen2.5-Coder-32B-Instruct',
      'deepseek-ai/DeepSeek-V3.2',
    ]);

    const doubaoPreset = getSiteInitializationPreset('doubao-coding-openai');
    expect(doubaoPreset).toMatchObject({
      id: 'doubao-coding-openai',
      platform: 'openai',
      defaultUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(doubaoPreset?.recommendedModels).toEqual([
      'ark-code-latest',
      'doubao-seed-2.0-code',
      'doubao-seed-2.0-pro',
    ]);

    const baiduOpenAiPreset = getSiteInitializationPreset('baidu-codingplan-openai');
    expect(baiduOpenAiPreset).toMatchObject({
      id: 'baidu-codingplan-openai',
      platform: 'openai',
      defaultUrl: 'https://qianfan.baidubce.com/v2/coding',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(baiduOpenAiPreset?.recommendedModels).toEqual(expect.arrayContaining(['ernie-x1-turbo-32k']));

    const baiduClaudePreset = getSiteInitializationPreset('baidu-codingplan-claude');
    expect(baiduClaudePreset).toMatchObject({
      id: 'baidu-codingplan-claude',
      platform: 'claude',
      defaultUrl: 'https://qianfan.baidubce.com/anthropic/coding',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: true,
    });
    expect(baiduClaudePreset?.recommendedModels).toEqual(expect.arrayContaining(['ernie-4.5-turbo-32k']));
  });

  it('detects Aliyun CodingPlan endpoints by URL', () => {
    expect(detectSiteInitializationPreset('https://coding.dashscope.aliyuncs.com/v1')).toMatchObject({
      id: 'codingplan-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://coding.dashscope.aliyuncs.com/apps/anthropic')).toMatchObject({
      id: 'codingplan-claude',
      platform: 'claude',
    });
    expect(detectSiteInitializationPreset('https://api.openai.com/v1')).toBeNull();
  });

  it('detects Zhipu Coding Plan OpenAI endpoints by URL but keeps Claude-compatible entry manual-only', () => {
    expect(detectSiteInitializationPreset('https://open.bigmodel.cn/api/coding/paas/v4')).toMatchObject({
      id: 'zhipu-coding-plan-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://open.bigmodel.cn/api/coding/paas/v4/')).toMatchObject({
      id: 'zhipu-coding-plan-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://open.bigmodel.cn/api/anthropic')).toBeNull();
  });

  it('detects vendor-specific OpenAI and Claude endpoints by URL', () => {
    expect(detectSiteInitializationPreset('https://api.deepseek.com/v1')).toMatchObject({
      id: 'deepseek-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://api.deepseek.com/anthropic')).toMatchObject({
      id: 'deepseek-claude',
      platform: 'claude',
    });

    expect(detectSiteInitializationPreset('https://api.moonshot.cn/v1/')).toMatchObject({
      id: 'moonshot-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://api.moonshot.cn/anthropic')).toMatchObject({
      id: 'moonshot-claude',
      platform: 'claude',
    });

    expect(detectSiteInitializationPreset('https://api.minimaxi.com/v1')).toMatchObject({
      id: 'minimax-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://api.minimaxi.com/anthropic')).toMatchObject({
      id: 'minimax-claude',
      platform: 'claude',
    });

    expect(detectSiteInitializationPreset('https://api-inference.modelscope.cn/v1')).toMatchObject({
      id: 'modelscope-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://api-inference.modelscope.cn')).toMatchObject({
      id: 'modelscope-claude',
      platform: 'claude',
    });

    expect(detectSiteInitializationPreset('https://ark.cn-beijing.volces.com/api/coding/v3')).toMatchObject({
      id: 'doubao-coding-openai',
      platform: 'openai',
    });

    expect(detectSiteInitializationPreset('https://qianfan.baidubce.com/v2/coding')).toMatchObject({
      id: 'baidu-codingplan-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://qianfan.baidubce.com/anthropic/coding')).toMatchObject({
      id: 'baidu-codingplan-claude',
      platform: 'claude',
    });
  });

  it('reselects openai presets from canonicalized root urls when platform is already known', () => {
    expect(detectSiteInitializationPreset('https://api.deepseek.com', 'openai')).toMatchObject({
      id: 'deepseek-openai',
      platform: 'openai',
    });
    expect(detectSiteInitializationPreset('https://coding.dashscope.aliyuncs.com', 'openai')).toMatchObject({
      id: 'codingplan-openai',
      platform: 'openai',
    });
  });

  it('exposes an API-key-first OrcaRouter preset only for the exact official endpoint', () => {
    expect(getSiteInitializationPreset('orcarouter-openai')).toMatchObject({
      id: 'orcarouter-openai',
      platform: 'orcarouter',
      defaultUrl: 'https://api.orcarouter.ai/v1',
      initialSegment: 'apikey',
      recommendedSkipModelFetch: false,
      recommendedModels: ['orcarouter/auto'],
    });

    expect(detectSiteInitializationPreset('https://api.orcarouter.ai/v1')).toMatchObject({
      id: 'orcarouter-openai',
      platform: 'orcarouter',
    });
    expect(detectSiteInitializationPreset('api.orcarouter.ai/v1')).toMatchObject({
      id: 'orcarouter-openai',
      platform: 'orcarouter',
    });
    expect(detectSiteInitializationPreset('http://api.orcarouter.ai/v1')).toBeNull();
    expect(detectSiteInitializationPreset('https://key:secret@api.orcarouter.ai/v1')).toBeNull();
    expect(detectSiteInitializationPreset('https://key:secret@api.orcarouter.ai', 'orcarouter')).toBeNull();

    expect(detectSiteInitializationPreset('https://evil-api.orcarouter.ai/v1')).toBeNull();
    expect(detectSiteInitializationPreset('https://api.orcarouter.ai.attacker.test/v1')).toBeNull();
    expect(detectSiteInitializationPreset('https://attacker.test/api.orcarouter.ai/v1')).toBeNull();
    expect(detectSiteInitializationPreset('https://api.orcarouter.ai@attacker.test/v1')).toBeNull();
  });
});
