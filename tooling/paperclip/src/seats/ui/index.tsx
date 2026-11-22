import {
  ActionBar,
  DataTable,
  type DataTableColumn,
  MetricCard,
  type PluginPageProps,
  Spinner,
  StatusBadge,
  TimeseriesChart,
  usePluginData,
} from "@paperclipai/plugin-sdk/ui";
import { manualResetActionKey, seatsPageDataKey } from "../plugin/bridge-keys.ts";
import type { SeatsPage as SeatsPageData } from "../plugin/seats-page.ts";
import {
  cardsView,
  type MoveView,
  movesView,
  refillCalendar,
  resettableSeats,
  type SeatRowView,
  type StateView,
  seatRowsView,
} from "./page-view.ts";

const seatColumns: DataTableColumn<SeatRowView>[] = [
  { key: "seat", header: "Seat" },
  {
    key: "state",
    header: "State",
    render: (value) => <StatusBadge {...(value as StateView)} />,
  },
  { key: "fiveHour", header: "5-hour window" },
  { key: "week", header: "Week" },
  { key: "agents", header: "Agents" },
  { key: "reading", header: "Reading" },
  { key: "signIn", header: "Sign-in" },
];

const moveColumns: DataTableColumn<MoveView>[] = [
  { key: "agent", header: "Agent" },
  { key: "from", header: "From" },
  { key: "to", header: "To" },
  { key: "why", header: "Why" },
];

/**
 * The board's "AI seats" page (seat forecast, section 6): top cards, the
 * seat table, capacity coming free over 7 days and the moves `seats.check`
 * would propose. Its data comes from the worker through Paperclip's bridge,
 * which lets only board users ask. Forecast numbers come with HAL-16026.
 *
 * It imports nothing but the SDK: Paperclip's page provides React.
 */
export function SeatsPage({ context }: PluginPageProps) {
  const { data, loading, error, refresh } = usePluginData<SeatsPageData>(seatsPageDataKey, {
    companyId: context.companyId,
  });
  if (error !== null) {
    return <p>The AI seats page couldn't load its data: {error.message}</p>;
  }
  if (data === null) {
    return loading ? <Spinner label="Loading the AI seats" /> : null;
  }
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <p>
        Data from {data.at}.{" "}
        <button type="button" onClick={refresh}>
          Refresh
        </button>
      </p>
      <Cards page={data} />
      <Seats page={data} />
      <section>
        <h2>Capacity coming free, next 7 days</h2>
        <TimeseriesChart data={refillCalendar(data)} type="bar" yLabel="Weekly points back" />
      </section>
      <Moves page={data} />
      <ManualReset page={data} onRecorded={refresh} />
    </div>
  );
}

function Cards({ page }: { readonly page: SeatsPageData }) {
  return (
    <section
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      }}
    >
      {cardsView(page).map((card) => (
        <MetricCard key={card.label} label={card.label} value={card.value} />
      ))}
    </section>
  );
}

function Seats({ page }: { readonly page: SeatsPageData }) {
  return (
    <section>
      <h2>Seats</h2>
      <DataTable
        columns={seatColumns as DataTableColumn<Record<string, unknown>>[]}
        rows={seatRowsView(page)}
        emptyMessage="No seats yet. The board adds them in the plugin's settings."
      />
      <p>
        Readings since {page.readerStartedAt}, when the plugin last started. Forecast columns come
        with the seat forecast.
      </p>
    </section>
  );
}

function Moves({ page }: { readonly page: SeatsPageData }) {
  const advice = page.proposal.resetAdvice;
  return (
    <section>
      <h2>Proposed moves</h2>
      <p>
        {page.movesEnabled
          ? "Moving agents is on in the settings, but this page moves no one."
          : "Nothing has moved. The board applies these moves."}
      </p>
      <DataTable
        columns={moveColumns as DataTableColumn<Record<string, unknown>>[]}
        rows={movesView(page)}
        emptyMessage="No moves to propose now."
      />
      <p>
        {advice.length === 0
          ? "No seat is worth its manual reset now."
          : `Worth a manual reset now: ${advice.join(", ")}.`}
      </p>
    </section>
  );
}

function ManualReset({
  page,
  onRecorded,
}: {
  readonly page: SeatsPageData;
  readonly onRecorded: () => void;
}) {
  const resettable = resettableSeats(page);
  return (
    <section>
      <h2>Record a manual reset</h2>
      <p>
        Record it here once you've reset a seat. Seats in one reset group share one manual reset.
      </p>
      {resettable.length === 0 ? (
        <p>Every reset group has used its manual reset.</p>
      ) : (
        <ActionBar
          actions={resettable.map((seatId) => ({
            label: `Reset recorded for ${seatId}`,
            actionKey: manualResetActionKey,
            params: { seatId },
            confirm: true,
            confirmMessage: `Record a manual reset of ${seatId} now? Its reset group can't record another.`,
          }))}
          onSuccess={onRecorded}
        />
      )}
    </section>
  );
}
