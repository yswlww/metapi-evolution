import React from 'react';
import {
  type ImageGenerationParameterEnabled,
  type ModelTesterModeState,
} from '../helpers/modelTesterSession.js';

type ImageField = keyof ImageGenerationParameterEnabled;
type ImageSettings = Pick<
  ModelTesterModeState,
  | 'imagesPrompt'
  | 'imagesN'
  | 'imagesSize'
  | 'imagesQuality'
  | 'imagesStyle'
  | 'imagesResponseFormat'
  | 'imagesOutputFormat'
  | 'imagesBackground'
  | 'imagesOutputCompression'
  | 'imagesModeration'
  | 'imagesUser'
>;

type ImageGenerationPanelProps = {
  isMobile: boolean;
  settings: ImageSettings;
  enabled: ImageGenerationParameterEnabled;
  customRequestMode?: boolean;
  onSettingsChange: (changes: Partial<ImageSettings>) => void;
  onToggle: (field: ImageField) => void;
};

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  outline: 'none',
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
};

const SIZE_PRESETS = ['auto', '1024x1024', '1024x1536', '1536x1024'];
const QUALITY_PRESETS = ['auto', 'low', 'medium', 'high', 'standard', 'hd'];
const MODERATION_PRESETS = ['auto', 'low'];

function ParameterRow({
  field,
  title,
  enabled,
  onToggle,
  children,
}: {
  field: ImageField;
  title: string;
  enabled: boolean;
  onToggle: (field: ImageField) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ opacity: enabled ? 1 : 0.56, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <label htmlFor={`image-${field}`} style={{ fontSize: 12, fontWeight: 600 }}>{title}</label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            aria-label={`启用 ${field}`}
            checked={enabled}
            onChange={() => onToggle(field)}
          />
          启用
        </label>
      </div>
      {children}
    </div>
  );
}

function CustomValueInput({
  id,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      id={id}
      aria-label={`${id}-custom`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      style={inputBaseStyle}
    />
  );
}

export default function ImageGenerationPanel({
  isMobile,
  settings,
  enabled,
  customRequestMode = false,
  onSettingsChange,
  onToggle,
}: ImageGenerationPanelProps) {
  if (customRequestMode) return null;

  const sizeIsCustom = !SIZE_PRESETS.includes(settings.imagesSize);
  const qualityIsCustom = !QUALITY_PRESETS.includes(settings.imagesQuality);
  const moderationIsCustom = !MODERATION_PRESETS.includes(settings.imagesModeration);

  return (
    <section
      aria-label="图片生成参数"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        border: '1px solid var(--color-border-light)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg-card)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>图片生成</div>
      <label htmlFor="image-prompt" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600 }}>
        prompt
        <textarea
          id="image-prompt"
          aria-label="prompt"
          value={settings.imagesPrompt}
          onChange={(event) => onSettingsChange({ imagesPrompt: event.target.value })}
          rows={4}
          placeholder="输入图片提示词"
          style={{ ...inputBaseStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <ParameterRow field="n" title="n" enabled={enabled.n} onToggle={onToggle}>
          <input
            id="image-n"
            aria-label="n"
            type="number"
            min={1}
            max={10}
            step={1}
            value={settings.imagesN ?? ''}
            onChange={(event) => {
              const value = event.target.value.trim();
              const parsed = value ? Number(value) : null;
              onSettingsChange({ imagesN: parsed === null || !Number.isFinite(parsed) ? null : Math.max(1, Math.min(10, Math.trunc(parsed))) });
            }}
            style={inputBaseStyle}
            disabled={!enabled.n}
          />
        </ParameterRow>

        <ParameterRow field="size" title="size" enabled={enabled.size} onToggle={onToggle}>
          <select
            id="image-size"
            aria-label="size"
            value={sizeIsCustom ? '__custom__' : settings.imagesSize}
            onChange={(event) => onSettingsChange({ imagesSize: event.target.value === '__custom__' ? (sizeIsCustom ? settings.imagesSize : '') : event.target.value })}
            style={inputBaseStyle}
            disabled={!enabled.size}
          >
            {SIZE_PRESETS.map((value) => <option key={value} value={value}>{value}</option>)}
            <option value="__custom__">custom</option>
          </select>
          {sizeIsCustom && (
            <div style={{ marginTop: 6 }}>
              <CustomValueInput id="size" value={settings.imagesSize} placeholder="例如 2048x2048" onChange={(value) => onSettingsChange({ imagesSize: value })} />
            </div>
          )}
        </ParameterRow>

        <ParameterRow field="quality" title="quality" enabled={enabled.quality} onToggle={onToggle}>
          <select
            id="image-quality"
            aria-label="quality"
            value={qualityIsCustom ? '__custom__' : settings.imagesQuality}
            onChange={(event) => onSettingsChange({ imagesQuality: event.target.value === '__custom__' ? (qualityIsCustom ? settings.imagesQuality : '') : event.target.value })}
            style={inputBaseStyle}
            disabled={!enabled.quality}
          >
            {QUALITY_PRESETS.map((value) => <option key={value} value={value}>{value}</option>)}
            <option value="__custom__">custom</option>
          </select>
          {qualityIsCustom && (
            <div style={{ marginTop: 6 }}>
              <CustomValueInput id="quality" value={settings.imagesQuality} placeholder="provider-compatible quality" onChange={(value) => onSettingsChange({ imagesQuality: value })} />
            </div>
          )}
        </ParameterRow>

        <ParameterRow field="style" title="style" enabled={enabled.style} onToggle={onToggle}>
          <select
            id="image-style"
            aria-label="style"
            value={settings.imagesStyle}
            onChange={(event) => onSettingsChange({ imagesStyle: event.target.value })}
            style={inputBaseStyle}
            disabled={!enabled.style}
          >
            <option value="vivid">vivid</option>
            <option value="natural">natural</option>
          </select>
        </ParameterRow>

        <ParameterRow field="response_format" title="response_format" enabled={enabled.response_format} onToggle={onToggle}>
          <select
            id="image-response-format"
            aria-label="response_format"
            value={settings.imagesResponseFormat}
            onChange={(event) => onSettingsChange({ imagesResponseFormat: event.target.value })}
            style={inputBaseStyle}
            disabled={!enabled.response_format}
          >
            <option value="url">url</option>
            <option value="b64_json">b64_json</option>
          </select>
        </ParameterRow>

        <ParameterRow field="output_format" title="output_format" enabled={enabled.output_format} onToggle={onToggle}>
          <select
            id="image-output-format"
            aria-label="output_format"
            value={settings.imagesOutputFormat}
            onChange={(event) => onSettingsChange({ imagesOutputFormat: event.target.value })}
            style={inputBaseStyle}
            disabled={!enabled.output_format}
          >
            <option value="png">png</option>
            <option value="webp">webp</option>
            <option value="jpeg">jpeg</option>
          </select>
        </ParameterRow>

        <ParameterRow field="background" title="background" enabled={enabled.background} onToggle={onToggle}>
          <select
            id="image-background"
            aria-label="background"
            value={settings.imagesBackground}
            onChange={(event) => onSettingsChange({ imagesBackground: event.target.value })}
            style={inputBaseStyle}
            disabled={!enabled.background}
          >
            <option value="auto">auto</option>
            <option value="opaque">opaque</option>
            <option value="transparent">transparent</option>
          </select>
        </ParameterRow>

        <ParameterRow field="output_compression" title="output_compression" enabled={enabled.output_compression} onToggle={onToggle}>
          <input
            id="image-output-compression"
            aria-label="output_compression"
            type="number"
            min={0}
            max={100}
            step={1}
            value={settings.imagesOutputCompression ?? ''}
            onChange={(event) => {
              const value = event.target.value.trim();
              const parsed = value ? Number(value) : null;
              onSettingsChange({ imagesOutputCompression: parsed === null || !Number.isFinite(parsed) ? null : Math.max(0, Math.min(100, Math.trunc(parsed))) });
            }}
            style={inputBaseStyle}
            disabled={!enabled.output_compression}
          />
        </ParameterRow>

        <ParameterRow field="moderation" title="moderation" enabled={enabled.moderation} onToggle={onToggle}>
          <select
            id="image-moderation"
            aria-label="moderation"
            value={moderationIsCustom ? '__custom__' : settings.imagesModeration}
            onChange={(event) => onSettingsChange({ imagesModeration: event.target.value === '__custom__' ? (moderationIsCustom ? settings.imagesModeration : '') : event.target.value })}
            style={inputBaseStyle}
            disabled={!enabled.moderation}
          >
            {MODERATION_PRESETS.map((value) => <option key={value} value={value}>{value}</option>)}
            <option value="__custom__">custom</option>
          </select>
          {moderationIsCustom && (
            <div style={{ marginTop: 6 }}>
              <CustomValueInput id="moderation" value={settings.imagesModeration} placeholder="provider-compatible moderation" onChange={(value) => onSettingsChange({ imagesModeration: value })} />
            </div>
          )}
        </ParameterRow>

        <ParameterRow field="user" title="user" enabled={enabled.user} onToggle={onToggle}>
          <input
            id="image-user"
            aria-label="user"
            value={settings.imagesUser}
            onChange={(event) => onSettingsChange({ imagesUser: event.target.value })}
            placeholder="可选用户标识"
            style={inputBaseStyle}
            disabled={!enabled.user}
          />
        </ParameterRow>
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        关闭开关的字段不会发送；size、quality、moderation 可通过 custom 显式传入兼容值。
      </div>
    </section>
  );
}
