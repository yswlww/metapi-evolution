import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ModelTester from './ModelTester.js';
import {
  DEBUG_TABS,
  DEFAULT_INPUTS,
  DEFAULT_MODE_STATE,
  DEFAULT_IMAGE_PARAMETER_ENABLED,
  DEFAULT_PARAMETER_ENABLED,
  MODEL_TESTER_STORAGE_KEY,
  serializeModelTesterSession,
} from './helpers/modelTesterSession.js';

const WEBP_BASE64 = 'UklGRgAAAABXRUJQ';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getModelsMarketplace: vi.fn(),
    getRoutes: vi.fn(),
    getRouteDecision: vi.fn(),
    proxyTest: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({ api: apiMock }));
vi.mock('../authSession.js', () => ({ clearAuthSession: vi.fn(), getAuthToken: vi.fn(() => null) }));
vi.mock('./model-tester/ConversationComposer.js', () => ({ default: () => null }));
vi.mock('./model-tester/DebugPanel.js', () => ({ default: () => null }));
vi.mock('../components/useAnimatedVisibility.js', () => ({ useAnimatedVisibility: () => ({ shouldRender: false, isVisible: false }) }));
vi.mock('../components/useIsMobile.js', () => ({ useIsMobile: () => true }));
vi.mock('../i18n.js', () => ({ tr: (value: string) => value }));

function collectText(node: any): string {
  const children = node?.children || [];
  return children.map((child: any) => (typeof child === 'string' ? child : collectText(child))).join('');
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ModelTester image generation integration', () => {
  let root: ReactTestRenderer | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getModelsMarketplace.mockResolvedValue({ models: [{ name: 'gpt-image-1' }] });
    apiMock.getRoutes.mockResolvedValue([]);
    apiMock.getRouteDecision.mockResolvedValue({ decision: { candidates: [] } });
    apiMock.proxyTest.mockResolvedValue({ created: 1, data: [{ b64_json: WEBP_BASE64, revised_prompt: 'revised' }] });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    root?.unmount();
    root = undefined;
    vi.unstubAllGlobals();
  });

  it('renders the dedicated panel and sends enabled image fields to generations', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => key === MODEL_TESTER_STORAGE_KEY
        ? serializeModelTesterSession({
          input: '',
          inputs: { ...DEFAULT_INPUTS, mode: 'images.generate', model: 'gpt-image-1' },
          parameterEnabled: DEFAULT_PARAMETER_ENABLED,
          imageParameterEnabled: {
            n: true,
            size: true,
            quality: false,
            style: true,
            response_format: true,
            output_format: true,
            background: true,
            output_compression: true,
            moderation: true,
            user: true,
          },
          messages: [],
          conversationFiles: [],
          pendingPayload: null,
          customRequestMode: false,
          customRequestBody: '',
          showDebugPanel: false,
          activeDebugTab: DEBUG_TABS.PREVIEW,
          modeState: {
            ...DEFAULT_MODE_STATE,
            imagesPrompt: '  draw a fox  ',
            imagesN: 2,
            imagesSize: '1536x1024',
            imagesQuality: 'high',
            imagesStyle: 'vivid',
            imagesResponseFormat: 'b64_json',
            imagesOutputFormat: 'webp',
            imagesBackground: 'transparent',
            imagesOutputCompression: 77,
            imagesModeration: 'low',
            imagesUser: 'person-7',
          },
        })
        : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    await act(async () => { root = create(<ModelTester />); });
    await flush();

    expect(root?.root.findByProps({ 'aria-label': '图片生成参数' })).toBeTruthy();
    const send = root?.root.findAllByType('button').find((button) => collectText(button).includes('发送请求'));
    expect(send).toBeTruthy();

    await act(async () => {
      send?.props.onClick();
      await Promise.resolve();
    });

    expect(apiMock.proxyTest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v1/images/generations',
      requestKind: 'json',
      stream: false,
      jobMode: false,
      rawMode: false,
      jsonBody: {
        model: 'gpt-image-1',
        prompt: 'draw a fox',
        n: 2,
        size: '1536x1024',
        style: 'vivid',
        response_format: 'b64_json',
        output_format: 'webp',
        background: 'transparent',
        output_compression: 77,
        moderation: 'low',
        user: 'person-7',
      },
    });
  });

  it('uses custom JSON instead of generated fields while rendering the actual image MIME and raw result', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => key === MODEL_TESTER_STORAGE_KEY
        ? serializeModelTesterSession({
          input: '',
          inputs: { ...DEFAULT_INPUTS, mode: 'images.generate', model: 'gpt-image-1' },
          parameterEnabled: DEFAULT_PARAMETER_ENABLED,
          imageParameterEnabled: {
            ...DEFAULT_IMAGE_PARAMETER_ENABLED,
            output_format: true,
          },
          messages: [],
          conversationFiles: [],
          pendingPayload: null,
          customRequestMode: true,
          customRequestBody: '{"model":"custom-image","prompt":"custom"}',
          showDebugPanel: false,
          activeDebugTab: DEBUG_TABS.PREVIEW,
          modeState: { ...DEFAULT_MODE_STATE, imagesOutputFormat: 'png' },
        })
        : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    await act(async () => { root = create(<ModelTester />); });
    await flush();
    expect(root?.root.findAllByProps({ 'aria-label': '图片生成参数' })).toHaveLength(0);
    const send = root?.root.findAllByType('button').find((button) => collectText(button).includes('发送请求'));
    await act(async () => {
      send?.props.onClick();
      await Promise.resolve();
    });
    await flush();

    expect(apiMock.proxyTest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/images/generations',
      rawMode: true,
      rawJsonText: '{"model":"custom-image","prompt":"custom"}',
    }));
    expect(root?.root.findAllByType('img').map((image) => image.props.src)).toEqual([
      `data:image/webp;base64,${WEBP_BASE64}`,
    ]);
    expect(collectText(root?.root.findByType('pre'))).toContain(WEBP_BASE64);
  });

  it('restores the asset prompt for the saved active mode instead of a different mode', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => key === MODEL_TESTER_STORAGE_KEY
        ? serializeModelTesterSession({
          input: '',
          inputs: { ...DEFAULT_INPUTS, mode: 'videos.create', model: 'gpt-image-1' },
          parameterEnabled: DEFAULT_PARAMETER_ENABLED,
          imageParameterEnabled: DEFAULT_IMAGE_PARAMETER_ENABLED,
          messages: [],
          conversationFiles: [],
          pendingPayload: null,
          customRequestMode: false,
          customRequestBody: '',
          showDebugPanel: false,
          activeDebugTab: DEBUG_TABS.PREVIEW,
          modeState: {
            ...DEFAULT_MODE_STATE,
            imagesPrompt: 'generate-image prompt',
            imagesEditPrompt: 'edit-image prompt',
            videosPrompt: 'video prompt',
          },
        })
        : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    await act(async () => { root = create(<ModelTester />); });
    await flush();

    expect(root?.root.findByProps({ placeholder: '输入视频生成提示词' }).props.value).toBe('video prompt');
  });
});
