import { useState } from 'react';
import { Field, TextArea, TextInput } from '../../components/EditDrawer';
import { useUiText } from '../../i18n/useUiText';
import { useLocalSettingsText } from './localSettingsText';
import { PARITY_ACTION_CLASS, PARITY_SELECT_CLASS } from '../../lib/settingsParityStyles';
import { createVisualPayloadRule, createCodexDefaultHighReasoningVisualPreset, payloadRulesToVisualRules, visualRulesToPayloadRules, PAYLOAD_RULE_PROTOCOL_OPTIONS, type VisualPayloadRule } from '../../lib/settingsParityPayload';

export default function PayloadRulesEditor({value, onChange}: {value: string; onChange: (value: string) => void}) {
  const t = useUiText(); const local = useLocalSettingsText();
  const [visual, setVisual] = useState<VisualPayloadRule[] | null>(null);
  const [error, setError] = useState('');
  const open = () => {
    try {setVisual(payloadRulesToVisualRules(value.trim() ? JSON.parse(value) : {})); setError('');}
    catch {setError(t('ui.adv.payload_rules_json'));}
  };
  const apply = () => {
    if (!visual) return;
    const result = visualRulesToPayloadRules(visual);
    if (!result.success) {setError(local('Invalid rule: check model, path and JSON value.', '規則無效：請檢查模型、路徑與 JSON 值。', '规则无效：请检查模型、路径与 JSON 值。')); return;}
    onChange(JSON.stringify(result.value, null, 2)); setVisual(null); setError('');
  };
  const patch = (id: string, input: Partial<VisualPayloadRule>) => setVisual(rows => (rows ?? []).map(row => row.id === id ? {...row, ...input} : row));
  return <div className="space-y-3">
    {error && <p role="alert">{error}</p>}
    <TextArea aria-label={t('ui.settings.adv_payload_title')} value={value} onChange={event => {onChange(event.target.value); setVisual(null);}} rows={6} className="font-mono" />
    <button
 className={PARITY_ACTION_CLASS}
type="button" onClick={open}>{local('Visual rule builder', '視覺化規則編輯器', '可视化规则编辑器')}</button>
    {visual && <div className="space-y-4">
      {visual.map(rule => <div key={rule.id} className="rounded-lg border border-[color:var(--color-border)] p-3 grid gap-3 sm:grid-cols-2">
        <Field label={local('Action', '動作', '动作')}><select
 className={PARITY_SELECT_CLASS}
value={rule.action} onChange={event => patch(rule.id, {action: event.target.value as VisualPayloadRule['action']})}>
          <option value="default">{local('Default', '預設', '默认')}</option><option value="default-raw">{local('Default raw JSON', '預設原始 JSON', '默认原始 JSON')}</option>
          <option value="override">{local('Override', '覆寫', '覆盖')}</option><option value="override-raw">{local('Override raw JSON', '覆寫原始 JSON', '覆盖原始 JSON')}</option><option value="filter">{local('Remove parameter', '移除參數', '移除参数')}</option>
        </select></Field>
        <Field label={local('Model pattern', '模型模式', '模型模式')}><TextInput value={rule.modelPattern} onChange={event => patch(rule.id, {modelPattern: event.target.value})} placeholder="gpt-*" /></Field>
        <Field label={local('Protocol / platform', '協定／平台', '协议／平台')}><select
 className={PARITY_SELECT_CLASS}
value={rule.protocol} onChange={event => patch(rule.id, {protocol: event.target.value})}>{PAYLOAD_RULE_PROTOCOL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.value ? option.label : local('All platforms', '所有平台', '所有平台')}</option>)}</select></Field>
        <Field label={local('Parameter path', '參數路徑', '参数路径')}><TextInput value={rule.path} onChange={event => patch(rule.id, {path: event.target.value})} placeholder="reasoning.effort" /></Field>
        {rule.action !== 'filter' && <>
          <Field label={local('Value', '值', '值')}><TextArea value={rule.value} onChange={event => patch(rule.id, {value: event.target.value})} rows={2} /></Field>
          <Field label={local('Value format', '值格式', '值格式')}><select
 className={PARITY_SELECT_CLASS}
value={rule.valueMode} onChange={event => patch(rule.id, {valueMode: event.target.value as 'text' | 'json'})}><option value="text">{local('Text', '文字', '文本')}</option><option value="json">JSON</option></select></Field>
        </>}
        <button
 className={PARITY_ACTION_CLASS}
type="button" onClick={() => setVisual(rows => (rows ?? []).filter(row => row.id !== rule.id))}>{local('Remove rule', '移除規則', '移除规则')}</button>
      </div>)}
      <div className="flex flex-wrap gap-3">
        <button
 className={PARITY_ACTION_CLASS}
type="button" onClick={() => setVisual(rows => [...(rows ?? []), createVisualPayloadRule()])}>{local('Add rule', '新增規則', '添加规则')}</button>
        <button
 className={PARITY_ACTION_CLASS}
type="button" onClick={() => setVisual(rows => [...(rows ?? []), ...createCodexDefaultHighReasoningVisualPreset()])}>{local('Codex high reasoning preset', 'Codex 高推理預設', 'Codex 高推理预设')}</button>
        <button
 className={PARITY_ACTION_CLASS}
type="button" onClick={apply}>{local('Apply builder to JSON', '將編輯器套用至 JSON', '将编辑器应用至 JSON')}</button>
        <button
 className={PARITY_ACTION_CLASS}
type="button" onClick={() => {setVisual(null); setError('');}}>{t('ui.common.cancel')}</button>
      </div>
      <p className="text-xs">{local('Apply the builder before saving. JSON edits discard unapplied builder changes.', '儲存前請先套用編輯器。修改 JSON 會捨棄未套用的編輯器變更。', '保存前请先应用编辑器。修改 JSON 会丢弃未应用的编辑器更改。')}</p>
    </div>}
  </div>;
}
