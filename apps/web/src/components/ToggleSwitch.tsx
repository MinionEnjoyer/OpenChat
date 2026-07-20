/** Small iOS-style on/off switch used for boolean settings. */
export function ToggleSwitch({ checked, onChange, label, hint }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, color: 'var(--text)' }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted-2)', marginTop: 2 }}>{hint}</span>}
      </span>
      <span
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative', flexShrink: 0, width: 40, height: 22, borderRadius: 11,
          background: checked ? 'var(--accent)' : 'var(--panel-dark)', transition: 'background .15s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }} />
      </span>
    </label>
  );
}
