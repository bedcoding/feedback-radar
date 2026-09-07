import assert from 'node:assert/strict';
import test from 'node:test';
import { tourKeyAction, visibleTourStepIndices } from './controls';
import type { TourStep } from './TourOverlay';

function event(key: string, overrides = {}) {
  return { key, defaultPrevented: false, isComposing: false, repeat: false,
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}

test('native buttons, links, date inputs and editable fields keep their keys', () => {
  for (const key of ['Enter', ' ', 'ArrowRight', 'ArrowLeft']) {
    assert.equal(tourKeyAction(event(key), true), null);
  }
});

test('background presentation shortcuts and Escape remain available', () => {
  for (const key of ['Enter', ' ', 'ArrowRight']) assert.equal(tourKeyAction(event(key), false), 'next');
  assert.equal(tourKeyAction(event('ArrowLeft'), false), 'previous');
  assert.equal(tourKeyAction(event('Escape'), false), 'exit');
  assert.equal(tourKeyAction(event('Escape'), true), 'exit');
  assert.equal(tourKeyAction(event('Tab'), false), null);
});

test('composition, held keys, modifiers and consumed events do not navigate the tour', () => {
  for (const flag of ['defaultPrevented', 'isComposing', 'repeat', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    for (const key of ['Enter', ' ', 'ArrowLeft', 'Escape']) {
      assert.equal(tourKeyAction(event(key, { [flag]: true }), false), null);
    }
  }
});

test('optional missing targets disappear from both navigation directions and progress dots', () => {
  const steps: TourStep[] = [
    { title: 'Start', body: null },
    { title: 'Countries', body: null, target: 'countries', skipIfMissing: true },
    { title: 'Dates', body: null, target: 'periods' },
    { title: 'End', body: null },
  ];
  assert.deepEqual(visibleTourStepIndices(steps, new Set()), [0, 1, 2, 3]);
  const indices = visibleTourStepIndices(steps, new Set(['countries', 'periods']));
  assert.deepEqual(indices, [0, 2, 3]);
  assert.equal(indices.find(index => index > 0), 2);
  assert.equal(indices.filter(index => index < 2).at(-1), 0);
  assert.deepEqual(visibleTourStepIndices(steps, new Set(['periods'])), [0, 1, 2, 3]);
});
