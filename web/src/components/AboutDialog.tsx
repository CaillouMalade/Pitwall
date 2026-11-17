import { CREDITS, REPOSITORY } from "../lib/credits.ts";
import { Dialog } from "./ui.tsx";

const link = { target: "_blank", rel: "noreferrer" } as const;

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="About Pitwall" onClose={onClose}>
      <div className="about">
        <div className="about-app">
          <img src="/favicon.svg" alt="" width={44} height={44} />
          <div>
            <strong>Pitwall</strong>
            <span className="muted">Version {__APP_VERSION__}</span>
          </div>
        </div>

        <section aria-labelledby="about-privacy">
          <h3 id="about-privacy">Privacy</h3>
          <p>
            Pitwall collects nothing. Your tracks and settings stay on this
            computer, and the weather services only receive the coordinates of
            the tracks you open.
          </p>
        </section>

        <section aria-labelledby="about-data">
          <h3 id="about-data">Data</h3>
          <ul className="credits">
            {CREDITS.map((credit) => (
              <li key={credit.name}>
                <a href={credit.url} {...link}>
                  {credit.name}
                </a>
                <span>{credit.detail}</span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Forecasts are converted, cut into 3-hour windows and combined by
            Pitwall. No weather service endorses it.
          </p>
        </section>

        <section aria-labelledby="about-licence">
          <h3 id="about-licence">Licence</h3>
          <p>
            Free software under the MIT licence, provided as is and without
            warranty. Weather can differ from every forecast: never rely on
            Pitwall alone for a safety decision.
          </p>
          <p className="about-links">
            <a href="/THIRD_PARTY_NOTICES.txt" {...link}>
              Open-source licences
            </a>
            <a href={`${REPOSITORY}/blob/main/docs/DATA_SOURCES.md`} {...link}>
              Data terms
            </a>
            <a href={`${REPOSITORY}/blob/main/docs/PRIVACY.md`} {...link}>
              Privacy
            </a>
            <a href={`${REPOSITORY}/blob/main/docs/EULA.md`} {...link}>
              Terms of use
            </a>
            <a href={REPOSITORY} {...link}>
              Source code
            </a>
          </p>
        </section>
      </div>
    </Dialog>
  );
}
