// Stats panel — analytical view backed by 5 non-trivial SQL queries
const StatsPanel = ({ onClose }) => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    API.getStats()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="sc-modal-scrim" onClick={onClose}>
      <div className="sc-stats" onClick={e => e.stopPropagation()}>
        <div className="sc-stats-head">
          <div className="sc-stats-title">
            {Icons.chart}
            <span>Study Statistics</span>
          </div>
          <button className="sc-iconbtn" onClick={onClose}>{Icons.x}</button>
        </div>

        {loading && (
          <div className="sc-stats-loading">Loading stats…</div>
        )}

        {error && (
          <div className="sc-stats-error">Failed to load stats: {error}</div>
        )}

        {data && (
          <div className="sc-stats-body">

            {/* Overview cards */}
            <div className="sc-stats-cards">
              <StatCard label="Decks" value={data.overview.total_decks} />
              <StatCard label="Sessions" value={data.overview.total_sessions} />
              <StatCard label="Questions Asked" value={data.overview.total_questions} />
              <StatCard label="Avg Q / Session" value={data.overview.avg_questions_per_session ?? '—'} />
            </div>

            <div className="sc-stats-cols">
              {/* Most queried decks */}
              <div className="sc-stats-section">
                <div className="sc-stats-section-title">Most Queried Decks</div>
                {data.top_decks.length === 0
                  ? <div className="sc-stats-empty">No data yet</div>
                  : data.top_decks.map((d, i) => (
                    <div key={d.id} className="sc-stats-row">
                      <div className="sc-stats-rank">{i + 1}</div>
                      <div className="sc-stats-row-body">
                        <div className="sc-stats-row-title">{d.title.length > 38 ? d.title.slice(0, 35) + '…' : d.title}</div>
                        <div className="sc-stats-row-meta">{d.session_count} {d.session_count === 1 ? 'session' : 'sessions'}</div>
                      </div>
                      <div className="sc-stats-bar-wrap">
                        <div
                          className="sc-stats-bar"
                          style={{ width: `${Math.round((d.question_count / (data.top_decks[0]?.question_count || 1)) * 100)}%` }}
                        />
                        <span className="sc-stats-bar-label">{d.question_count}q</span>
                      </div>
                    </div>
                  ))
                }
              </div>

              {/* Most active sessions */}
              <div className="sc-stats-section">
                <div className="sc-stats-section-title">Most Active Sessions</div>
                {data.top_sessions.filter(s => s.question_count > 0).length === 0
                  ? <div className="sc-stats-empty">No data yet</div>
                  : data.top_sessions.filter(s => s.question_count > 0).map((s, i) => (
                    <div key={s.id} className="sc-stats-row">
                      <div className="sc-stats-rank">{i + 1}</div>
                      <div className="sc-stats-row-body">
                        <div className="sc-stats-row-title">{s.name.length > 28 ? s.name.slice(0, 25) + '…' : s.name}</div>
                        <div className="sc-stats-row-meta">{s.deck_count} {s.deck_count === 1 ? 'source' : 'sources'}</div>
                      </div>
                      <div className="sc-stats-bar-wrap">
                        <div
                          className="sc-stats-bar sc-stats-bar-alt"
                          style={{ width: `${Math.round((s.question_count / (data.top_sessions[0]?.question_count || 1)) * 100)}%` }}
                        />
                        <span className="sc-stats-bar-label">{s.question_count}q</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Activity over time */}
            <div className="sc-stats-section">
              <div className="sc-stats-section-title">Activity Over Time</div>
              {data.activity.length === 0
                ? <div className="sc-stats-empty">No activity yet</div>
                : (
                  <div className="sc-stats-timeline">
                    {data.activity.map(a => {
                      const max = Math.max(...data.activity.map(x => x.questions));
                      return (
                        <div key={a.day} className="sc-stats-tl-row">
                          <div className="sc-stats-tl-day">{a.day}</div>
                          <div className="sc-stats-tl-bar-wrap">
                            <div className="sc-stats-tl-bar" style={{ width: `${Math.round((a.questions / max) * 100)}%` }} />
                          </div>
                          <div className="sc-stats-tl-count">{a.questions}</div>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>

            {/* Unused decks */}
            {data.unused_decks.length > 0 && (
              <div className="sc-stats-section">
                <div className="sc-stats-section-title">Uploaded but Never Used</div>
                {data.unused_decks.map(d => (
                  <div key={d.id} className="sc-stats-unused-row">
                    {Icons.doc}
                    <span>{d.title}</span>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ label, value }) => (
  <div className="sc-stat-card">
    <div className="sc-stat-card-value">{value}</div>
    <div className="sc-stat-card-label">{label}</div>
  </div>
);

window.StatsPanel = StatsPanel;
