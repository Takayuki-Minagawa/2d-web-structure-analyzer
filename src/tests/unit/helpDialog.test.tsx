import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hasOpenModalDialog } from '../../rendering/interactionHelpers';
import { HelpDialog } from '../../ui/HelpDialog';

describe('HelpDialog deletion guard', () => {
  it('renders as the modal dialog recognized by the canvas shortcut guard', () => {
    const markup = renderToStaticMarkup(<HelpDialog open onClose={() => undefined} />);

    expect(markup).toContain('role="presentation"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
  });

  it('detects the modal selector used to block Delete and Backspace', () => {
    const selectors: string[] = [];
    const modalRoot = {
      querySelector(selector: string): Element | null {
        selectors.push(selector);
        return {} as Element;
      },
    };

    expect(hasOpenModalDialog(modalRoot)).toBe(true);
    expect(selectors).toEqual(['[role="dialog"][aria-modal="true"]']);
    expect(hasOpenModalDialog({ querySelector: () => null })).toBe(false);
  });
});
