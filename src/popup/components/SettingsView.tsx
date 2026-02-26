import type { IconDisplayMode, TrustBarPosition } from '../../common/types';

interface SettingsViewProps {
  iconDisplayMode: IconDisplayMode;
  onChangeMode: (mode: IconDisplayMode) => void;
  trustBarEnabled: boolean;
  trustBarPosition: TrustBarPosition;
  trustBarSize: number;
  onChangeTrustBar: (enabled: boolean, position: TrustBarPosition, size: number) => void;
  onClose: () => void;
}

export function SettingsView({
  iconDisplayMode,
  onChangeMode,
  trustBarEnabled,
  trustBarPosition,
  trustBarSize,
  onChangeTrustBar,
  onClose,
}: SettingsViewProps) {
  return (
    <div class="settings-panel">
      <div class="settings-header">
        <span class="settings-title">Icon Display</span>
        <button class="btn btn-ghost btn-sm" onClick={onClose}>Done</button>
      </div>
      <div class="settings-options">
        <button
          class={`settings-option ${iconDisplayMode === 'numbers' ? 'active' : ''}`}
          onClick={() => onChangeMode('numbers')}
        >
          <span class="settings-option-label">Numbers</span>
          <span class="settings-option-desc">Show score (0-100)</span>
        </button>
        <button
          class={`settings-option ${iconDisplayMode === 'symbols' ? 'active' : ''}`}
          onClick={() => onChangeMode('symbols')}
        >
          <span class="settings-option-label">Symbols</span>
          <span class="settings-option-desc">Show tick, warning, or stop sign</span>
        </button>
      </div>

      <div class="settings-header" style={{ marginTop: '12px' }}>
        <span class="settings-title">Site Bar</span>
      </div>
      <div class="settings-options">
        <button
          class={`settings-option ${trustBarEnabled ? 'active' : ''}`}
          onClick={() => onChangeTrustBar(true, trustBarPosition, trustBarSize)}
        >
          <span class="settings-option-label">On</span>
          <span class="settings-option-desc">Show colored bar on pages</span>
        </button>
        <button
          class={`settings-option ${!trustBarEnabled ? 'active' : ''}`}
          onClick={() => onChangeTrustBar(false, trustBarPosition, trustBarSize)}
        >
          <span class="settings-option-label">Off</span>
          <span class="settings-option-desc">Hide site bar</span>
        </button>
      </div>

      {trustBarEnabled && (
        <>
          <div class="settings-header" style={{ marginTop: '10px' }}>
            <span class="settings-title">Bar Position</span>
          </div>
          <div class="settings-options">
            <button
              class={`settings-option ${trustBarPosition === 'top' ? 'active' : ''}`}
              onClick={() => onChangeTrustBar(true, 'top', trustBarSize)}
            >
              <span class="settings-option-label">Top</span>
            </button>
            <button
              class={`settings-option ${trustBarPosition === 'bottom' ? 'active' : ''}`}
              onClick={() => onChangeTrustBar(true, 'bottom', trustBarSize)}
            >
              <span class="settings-option-label">Bottom</span>
            </button>
          </div>

          <div class="settings-header" style={{ marginTop: '10px' }}>
            <span class="settings-title">Bar Size</span>
          </div>
          <div class="settings-options">
            {[1, 2, 3, 4].map((size) => (
              <button
                key={size}
                class={`settings-option ${trustBarSize === size ? 'active' : ''}`}
                onClick={() => onChangeTrustBar(true, trustBarPosition, size)}
              >
                <span class="settings-option-label">{size}px</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
