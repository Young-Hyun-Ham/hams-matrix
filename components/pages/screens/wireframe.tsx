export function Wireframe({ kind }: { kind: string }) {
  return (
    <div className={`wireframe wireframe-${kind}`} aria-hidden="true">
      <div className="wire-top">
        <i />
        <i />
        <i />
        <span />
      </div>
      <div className="wire-body">
        {kind !== "auth" && (
          <div className="wire-side">
            <b />
            {[1, 2, 3, 4, 5].map((i) => (
              <i key={i} />
            ))}
          </div>
        )}
        <div className="wire-main">
          <div className="wire-title" />
          {kind === "auth" ? (
            <div className="wire-auth">
              <b />
              <i />
              <i />
              <em />
            </div>
          ) : kind === "dashboard" || kind === "detail" ? (
            <>
              <div className="wire-banner" />
              <div className="wire-metrics">
                <i />
                <i />
                <i />
              </div>
              <div className="wire-lines">
                <i />
                <i />
                <i />
              </div>
            </>
          ) : kind === "files" || kind === "team" ? (
            <div className="wire-tiles">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          ) : (
            <div className="wire-lines">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
