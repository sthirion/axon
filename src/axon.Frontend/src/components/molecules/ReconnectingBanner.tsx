import { memo } from 'react';

interface ReconnectingBannerProps {
  readonly visible: boolean;
}

// The live region stays mounted so screen readers announce the text when it appears.
export const ReconnectingBanner = memo(function ReconnectingBanner({
  visible,
}: ReconnectingBannerProps) {
  return (
    <div aria-live="polite">
      {visible && (
        <p className="rounded-md border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950 p-2 text-sm text-amber-900 dark:text-amber-100">
          Reconnecting…
        </p>
      )}
    </div>
  );
});
ReconnectingBanner.displayName = 'ReconnectingBanner';
