import { DEFAULT_JOB_STATUSES, ROLES } from "@servex/shared";
import { ROADMAP } from "@/lib/roadmap";

export default function HomePage() {
  return (
    <main className="shell">
      <header>
        <p className="eyebrow">SERVEX</p>
        <h1>Global Enterprise Service Management Operating System</h1>
        <p className="lede">
          This app is in its foundation phase. There is no login, no customer data and no working
          modules yet. The table below shows what is being built and in which order.
        </p>
      </header>

      <section aria-labelledby="status-heading">
        <h2 id="status-heading">Build status</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Phase</th>
              <th scope="col">Area</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {ROADMAP.map((entry) => (
              <tr key={entry.phase}>
                <td>{entry.phase}</td>
                <td>{entry.area}</td>
                <td>
                  <span className={entry.status === "In progress" ? "badge active" : "badge"}>
                    {entry.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="shared-heading">
        <h2 id="shared-heading">Shared domain package</h2>
        <p>
          Loaded from <code>@servex/shared</code>: {ROLES.length} roles and{" "}
          {DEFAULT_JOB_STATUSES.length} default work-order statuses.
        </p>
      </section>
    </main>
  );
}
