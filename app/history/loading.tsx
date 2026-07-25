import { HistoryChartSkeleton } from "./HistoryClient";

export default function HistoryLoading() {
  return (
    <main className="wrap historypage" aria-busy="true">
      <div className="history-route-head">
        <div className="sk" />
        <div className="sk" />
      </div>
      <div className="history-route-stats">
        {Array.from({ length: 4 }).map((_, i) => <div className="sk" key={i} />)}
      </div>
      <div className="history-route-picker sk" />
      <section className="panel history-panel">
        <div className="history-panel-head">
          <div>
            <div className="history-route-title sk" />
            <div className="history-route-subtitle sk" />
          </div>
          <div className="history-route-actions sk" />
        </div>
        <HistoryChartSkeleton />
      </section>
    </main>
  );
}
