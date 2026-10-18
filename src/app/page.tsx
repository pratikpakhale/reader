import { ReaderStage } from "@/components/shell/reader";
import { SiteHeader } from "@/components/site-header";
import { Dropzone } from "@/components/landing/dropzone";
import { Recents } from "@/components/landing/recents";
import { FORMATS } from "@/lib/formats/registry";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [...new Set(FORMATS.map((format) => format.label))],
};

function Landing() {
  return (
    <main className="flex-1">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      <section className="mx-auto grid max-w-[1440px] items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:py-20">
        <h1 className="headline text-[clamp(2.75rem,7vw,4.75rem)] text-ink lg:col-span-5">
          Open
          <br />
          anything.
          <br />
          <span className="text-ink-faint">Upload nothing.</span>
        </h1>

        <div className="lg:col-span-7">
          <Dropzone />
          <p className="etch mt-4 text-center text-ink-faint">
            Documents · sheets · slides · books · images · media · code · archives · 3D · fonts
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-16 empty:hidden sm:px-6">
        <Recents />
      </section>
    </main>
  );
}

export default function Home() {
  return <ReaderStage landing={<Landing />} />;
}
