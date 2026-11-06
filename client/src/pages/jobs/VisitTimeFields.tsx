/**
 * Optional time range for one job visit (staging or destage). Leaving the
 * start empty keeps the visit all day; leaving the end empty makes it 2 hours.
 * Times are in the business time zone (Schedule → Import calendars).
 */
export function VisitTimeFields({
  label, start, end, onChange,
}: {
  label: string;
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const invalid = !!start && !!end && end <= start;
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          className="input-field"
          type="time"
          aria-label={`${label} start`}
          value={start}
          style={{ flex: 1, minWidth: 0 }}
          onChange={(e) => onChange(e.target.value, e.target.value ? end : "")}
        />
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>to</span>
        <input
          className="input-field"
          type="time"
          aria-label={`${label} end`}
          value={end}
          disabled={!start}
          style={{ flex: 1, minWidth: 0 }}
          onChange={(e) => onChange(start, e.target.value)}
        />
        {start && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ fontSize: 12, padding: "5px 10px", flexShrink: 0 }}
            onClick={() => onChange("", "")}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, marginTop: 4, color: invalid ? "var(--red-text)" : "var(--text-tertiary)" }}>
        {invalid
          ? "End time must be after the start time"
          : !start
            ? "Optional. Leave empty for all day."
            : !end
              ? "No end time: shown as 2 hours."
              : "Business time zone."}
      </div>
    </div>
  );
}
