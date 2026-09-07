import type { TourStep } from './TourOverlay';

type TourKeyEvent = Pick<KeyboardEvent,
  'key' | 'defaultPrevented' | 'isComposing' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

/** Keep native button activation, form editing and browser shortcuts intact. */
export function tourKeyAction(event: TourKeyEvent, interactive: boolean): 'next' | 'previous' | 'exit' | null {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.key === 'Escape') return 'exit';
  if (interactive) return null;
  if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') return 'next';
  if (event.key === 'ArrowLeft') return 'previous';
  return null;
}

/** Keep source indices stable when an optional, data-dependent step is absent. */
export function visibleTourStepIndices(steps: readonly TourStep[], missingTargets: ReadonlySet<string>): number[] {
  return steps.flatMap((step, index) =>
    step.skipIfMissing && step.target && missingTargets.has(step.target) ? [] : [index]);
}
