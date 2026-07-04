import { useRef, useState } from 'react';

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: 'No limit', minutes: null },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 1440 },
  { label: '3 days', minutes: 4320 },
  { label: '1 week', minutes: 10080 },
];

export function PollModal({
  onCreate,
  onClose,
}: {
  onCreate: (data: { question: string; options: string[]; multiple: boolean; durationMinutes: number | null }) => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [durationIdx, setDurationIdx] = useState(0);
  const pressedOnOverlay = useRef(false);

  const cleaned = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim().length > 0 && cleaned.length >= 2;

  function setOption(i: number, v: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  }
  function addOption() {
    setOptions((prev) => (prev.length >= 10 ? prev : [...prev, '']));
  }
  function removeOption(i: number) {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function submit() {
    if (!valid) return;
    onCreate({ question: question.trim(), options: cleaned, multiple, durationMinutes: DURATIONS[durationIdx].minutes });
  }

  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', marginBottom: 8 };
  const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', outline: 'none', fontSize: 14 };

  return (
    <div
      onMouseDown={(e) => { pressedOnOverlay.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOnOverlay.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
    >
      <div style={{ background: 'var(--panel)', color: 'var(--text)', borderRadius: 10, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', padding: 22, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 19, color: 'var(--text-strong)' }}>Create a Poll</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <span style={label}>Question</span>
          <input autoFocus style={input} value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask something…" />
        </div>

        <div style={{ marginBottom: 18 }}>
          <span style={label}>Options</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {options.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input style={input} value={o} maxLength={100} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                {options.length > 2 && (
                  <button onClick={() => removeOption(i)} title="Remove"
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>×</button>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button onClick={addOption} style={{ marginTop: 8, background: 'none', border: '1px dashed var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6, padding: '7px 10px', fontSize: 13, width: '100%' }}>
              + Add option
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Allow multiple choices
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginLeft: 'auto' }}>
            Duration
            <select value={durationIdx} onChange={(e) => setDurationIdx(Number(e.target.value))}
              style={{ ...input, width: 'auto', padding: '6px 8px' }}>
              {DURATIONS.map((d, i) => <option key={i} value={i}>{d.label}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={!valid}
            style={{ padding: '9px 20px', borderRadius: 6, border: 'none', background: valid ? 'var(--accent)' : 'var(--panel-dark)', color: valid ? 'var(--accent-text)' : 'var(--muted-2)', cursor: valid ? 'pointer' : 'default', fontWeight: 600 }}>
            Create Poll
          </button>
        </div>
      </div>
    </div>
  );
}
