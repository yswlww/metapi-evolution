import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { create } from 'react-test-renderer';
import ImageGenerationPanel from './ImageGenerationPanel.js';
import { DEFAULT_IMAGE_PARAMETER_ENABLED, DEFAULT_MODE_STATE } from '../helpers/modelTesterSession.js';

describe('ImageGenerationPanel', () => {
  it('exposes prompt and every supported advanced control with explicit toggles', () => {
    const root = create(
      <ImageGenerationPanel
        isMobile
        settings={{ ...DEFAULT_MODE_STATE, imagesPrompt: 'draw a cat' }}
        enabled={{ ...DEFAULT_IMAGE_PARAMETER_ENABLED, n: true }}
        onSettingsChange={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    const labels = [
      ...root.root.findAllByType('input'),
      ...root.root.findAllByType('textarea'),
    ].map((node) => node.props['aria-label']);
    const selectLabels = root.root.findAllByType('select').map((node) => node.props['aria-label']);
    expect(labels).toEqual(expect.arrayContaining([
      'prompt',
      'n',
      'output_compression',
      'user',
      '启用 n',
      '启用 size',
      '启用 quality',
      '启用 style',
      '启用 response_format',
      '启用 output_format',
      '启用 background',
      '启用 output_compression',
      '启用 moderation',
      '启用 user',
    ]));
    expect(selectLabels).toEqual(expect.arrayContaining([
      'size',
      'quality',
      'style',
      'response_format',
      'output_format',
      'background',
      'moderation',
    ]));
  });

  it('clamps numeric UI values at the component boundary and omits form in custom mode', () => {
    const onSettingsChange = vi.fn();
    const root = create(
      <ImageGenerationPanel
        isMobile={false}
        settings={{ ...DEFAULT_MODE_STATE }}
        enabled={{ ...DEFAULT_IMAGE_PARAMETER_ENABLED, n: true, output_compression: true }}
        onSettingsChange={onSettingsChange}
        onToggle={vi.fn()}
      />,
    );

    const n = root.root.findByProps({ 'aria-label': 'n' });
    n.props.onChange({ target: { value: '999' } });
    expect(onSettingsChange).toHaveBeenCalledWith({ imagesN: 10 });
    const compression = root.root.findByProps({ 'aria-label': 'output_compression' });
    compression.props.onChange({ target: { value: '-4' } });
    expect(onSettingsChange).toHaveBeenCalledWith({ imagesOutputCompression: 0 });

    const custom = create(
      <ImageGenerationPanel
        isMobile={false}
        settings={{ ...DEFAULT_MODE_STATE }}
        enabled={DEFAULT_IMAGE_PARAMETER_ENABLED}
        customRequestMode
        onSettingsChange={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(custom.toJSON()).toBeNull();
  });

  it('disables custom size, quality, and moderation inputs with their parent fields', () => {
    const root = create(
      <ImageGenerationPanel
        isMobile={false}
        settings={{
          ...DEFAULT_MODE_STATE,
          imagesSize: '2048x2048',
          imagesQuality: 'provider-quality',
          imagesModeration: 'provider-moderation',
        }}
        enabled={DEFAULT_IMAGE_PARAMETER_ENABLED}
        onSettingsChange={vi.fn()}
        onToggle={vi.fn()}
      />,
    );

    expect(root.root.findByProps({ 'aria-label': 'size-custom' }).props.disabled).toBe(true);
    expect(root.root.findByProps({ 'aria-label': 'quality-custom' }).props.disabled).toBe(true);
    expect(root.root.findByProps({ 'aria-label': 'moderation-custom' }).props.disabled).toBe(true);
  });
});
