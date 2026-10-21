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
        <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
          Reconnecting…
        </p>
      )}
    </div>
  );
});
ReconnectingBanner.displayName = 'ReconnectingBanner';
