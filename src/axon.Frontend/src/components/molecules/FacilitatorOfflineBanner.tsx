import { memo } from 'react';

export const FACILITATOR_OFFLINE_MESSAGE =
  'The facilitator is offline. Voting continues, and the facilitator can rejoin from the same browser.';

interface FacilitatorOfflineBannerProps {
  readonly visible: boolean;
}

// The live region stays mounted so screen readers announce the text when it appears.
export const FacilitatorOfflineBanner = memo(function FacilitatorOfflineBanner({
  visible,
}: FacilitatorOfflineBannerProps) {
  return (
    <div role="status">
      {visible && (
        <p className="rounded-md border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
          {FACILITATOR_OFFLINE_MESSAGE}
        </p>
      )}
    </div>
  );
});
FacilitatorOfflineBanner.displayName = 'FacilitatorOfflineBanner';
