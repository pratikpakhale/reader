import { ReaderStage } from "@/components/shell/reader";
import { Dropzone } from "@/components/landing/dropzone";
import { FamilyDoor } from "@/components/landing/family-door";
import { Recents } from "@/components/landing/recents";
import { FAMILIES, FORMATS, extensionsFor } from "@/lib/formats/registry";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

// Drawn from the same table detection uses, so the page cannot advertise a
// format the reader does not open.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires a browser with WebAssembly",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [...new Set(FORMATS.map((format) => format.label))],
};

// Rounded down, so the claim stays true as formats come and go.
const EXTENSION_COUNT = Math.floor(new Set(FORMATS.flatMap((format) => format.extensions)).size / 50) * 50;

function Landing() {
  return (
    <main className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      <section className="mx-auto grid max-w-[1440px] items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:py-24 max-sm:gap-8 max-sm:py-10">
        <div className="lg:col-span-5">
          <h1 className="headline text-[clamp(2.75rem,7vw,4.75rem)] text-ink">
            Open
            <br />
            anything.
            <br />
            <span className="text-ink-faint">Upload nothing.</span>
          </h1>
          <p className="mt-7 max-w-md text-[17px] leading-relaxed text-ink-muted">
            Documents, spreadsheets, slides, books, photos, video, code, archives, databases and 3D models — read
            right here, on any device. Nothing leaves it.
          </p>
        </div>

        <div className="lg:col-span-7">
          <Dropzone />
          <p className="etch mt-4 text-center text-ink-faint">
            {EXTENSION_COUNT}+ file types · any size · nothing is sent
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-14 sm:px-6 empty:hidden">
        <Recents />
      </section>

      <section className="border-y border-line bg-sunken/50">
        <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6">
          <h2 className="etch text-ink-soft">What it reads</h2>
          <ul className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
            {FAMILIES.map((family) => (
              <li key={family.id}>
                <FamilyDoor
                  family={family.id}
                  name={family.name}
                  blurb={family.blurb}
                  kinds={family.highlights}
                  count={extensionsFor(family.id).length}
                />
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
            Anything else opens too: text in any encoding as text, and everything else byte by byte in the hex view.
            Files inside archives and email attachments open in place.
          </p>
        </div>
      </section>

      <footer>
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="etch text-ink-faint">Reader.</p>
          <p className="etch text-ink-faint max-sm:hidden">⌘O to open · ⌥↑↓ to switch files · No cookies · no analytics</p>
        </div>
      </footer>
    </main>
  );
}

export default function Home() {
  return <ReaderStage landing={<Landing />} />;
}
