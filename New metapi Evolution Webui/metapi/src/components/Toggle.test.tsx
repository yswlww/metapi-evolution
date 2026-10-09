import React from 'react';
import { create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { Toggle } from './EditDrawer';

it('uses a keyboard-operable native checkbox that respects disabled fieldsets', () => {
  const changed = vi.fn();
  const tree = create(<fieldset disabled><Toggle label="Enabled" checked={false} onChange={changed} /></fieldset>);
  const controls = tree.root.findAllByType('input');
  expect(controls).toHaveLength(1);
  expect(controls[0].props.type).toBe('checkbox');
  expect(controls[0].props.checked).toBe(false);
  expect(tree.root.findAllByType('span').every(node => !node.props.onClick)).toBe(true);
  controls[0].props.onChange({ target: { checked: true } });
  expect(changed).toHaveBeenCalledWith(true);
  tree.unmount();
});
