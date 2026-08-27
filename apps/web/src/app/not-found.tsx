import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import Link from "next/link";

const inter = Inter({
	subsets: ["latin"],
	display: "swap",
	variable: "--vesper-sans",
});

const instrumentSerif = Instrument_Serif({
	subsets: ["latin"],
	weight: "400",
	style: "italic",
	display: "swap",
	variable: "--vesper-serif",
});

export const metadata: Metadata = {
	title: "404 — doki",
	description: "This page is not here any more.",
	robots: { index: false, follow: true },
};

const CSS = `
html, body { background: #000000 !important; color: #ffffff; }

@layer base {
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
  }

  a { color: inherit; text-decoration: none; }
  svg { display: block; }
}

.nf {
  --font-ui: var(--vesper-sans), "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: var(--vesper-serif), "Instrument Serif", "Times New Roman", Times, serif;
  --border: rgba(255, 255, 255, 0.16);
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
  min-height: 100dvh;
  background: #000000;
  font-family: var(--font-ui);
}

.nf-grain {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  opacity: 0.05;
}
.nf-grain svg { width: 100%; height: 100%; }

.nf-header { padding: 22px 40px 10px; }
.nf-logo {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 15.5px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: #ffffff;
}
.nf-logo svg { width: 22px; height: 22px; flex: none; }
.nf-logo-suffix { font-weight: 400; }

.nf-main {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.nf-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 620px;
  text-align: center;
}

.nf-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 22px;
  padding: 9px 15px;
  border-radius: 5px;
  background: linear-gradient(90deg, #7d7d7d 0%, #2a2a2a 52%, #0a0a0a 100%);
  color: #f2f2f2;
  font-size: 12.5px;
  letter-spacing: -0.01em;
}
.nf-badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.6);
}

.nf-copy h1 {
  font-size: 48px;
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1.12;
  color: #ffffff;
}
.nf-copy h1 em {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 400;
  font-size: 1.08em;
  letter-spacing: -0.03em;
  color: #9a9a9a;
}
.nf-lede {
  max-width: 470px;
  margin-top: 18px;
  color: #9a9a9a;
  font-size: 15.5px;
  line-height: 1.55;
  letter-spacing: -0.015em;
}

.nf-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 26px;
}
.nf-btn {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  padding: 0 18px;
  border-radius: 6px;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
}
.nf-btn::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 20%, rgba(255, 255, 255, 0.45) 48%, transparent 76%);
  transform: translateX(-130%);
  transition: transform 0.65s ease;
}
.nf-btn:hover::after { transform: translateX(130%); }

.nf-solid {
  background: linear-gradient(180deg, #ffffff 0%, #e7e7e7 48%, #cfcfcf 100%);
  color: #111111;
  border: 1px solid #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
.nf-solid:hover {
  background: linear-gradient(180deg, #ffffff 0%, #f3f6ff 42%, #d5def2 100%);
  border-color: #f2f6ff;
  box-shadow: inset 0 1px 0 #ffffff, 0 0 26px rgba(186, 208, 255, 0.4), 0 8px 18px rgba(255, 255, 255, 0.14);
}

.nf-ghost {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.5) 46%, rgba(150, 170, 200, 0.1));
  color: #ffffff;
  border: 1px solid rgba(198, 198, 198, 0.55);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.nf-ghost:hover {
  border-color: rgba(220, 230, 255, 0.8);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 0 24px rgba(170, 200, 255, 0.28);
}

.nf-foot {
  padding: 0 40px 36px;
  padding-bottom: max(36px, env(safe-area-inset-bottom));
  color: #d8d8d8;
  font-size: 13.5px;
  letter-spacing: -0.015em;
  text-align: center;
}
.nf-foot a { color: #ffffff; border-bottom: 1px solid var(--border); }

.nf-appear {
  opacity: 1;
  animation: nf-in 1.05s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--d, 0.08s);
}
@keyframes nf-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 900px) {
  .nf-header { padding: 16px 18px 10px; }
  .nf-copy h1 { font-size: 36px; }
  .nf-foot { padding: 0 20px 28px; }
}

@media (max-width: 560px) {
  .nf-copy h1 { font-size: 34px; }
  .nf-actions { flex-direction: column; }
  .nf-actions .nf-btn { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
  .nf-appear { opacity: 1; transform: none; }
}
`;

export default function NotFound() {
	return (
		<>
			{/* Inline so the very first paint is already black. */}
			<style dangerouslySetInnerHTML={{ __html: CSS }} />

			<div aria-hidden="true" className="nf-grain">
				<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
					<filter id="doki-404-grain">
						<feTurbulence
							baseFrequency="0.85"
							numOctaves="3"
							stitchTiles="stitch"
							type="fractalNoise"
						/>
					</filter>
					<rect filter="url(#doki-404-grain)" height="100%" width="100%" />
				</svg>
			</div>

			<div className={`nf ${inter.variable} ${instrumentSerif.variable}`}>
				<header className="nf-header">
					<Link
						aria-label="doki.ai"
						className="nf-logo nf-appear"
						href="/"
						style={{ "--d": "0.08s" } as React.CSSProperties}
					>
						<svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
							<g transform="rotate(-30 12 12)">
								<circle cx="7.3" cy="3.2" r="1.45" />
								<rect height="14.6" rx="1.8" width="3.6" x="5.5" y="4.7" />
								<rect height="14.6" rx="1.8" width="3.6" x="14.9" y="4.7" />
								<circle cx="16.7" cy="20.8" r="1.45" />
							</g>
						</svg>
						<span>
							doki<span className="nf-logo-suffix">.ai</span>
						</span>
					</Link>
				</header>

				<main className="nf-main">
					<div className="nf-copy">
						<span
							className="nf-badge nf-appear"
							style={{ "--d": "0.16s" } as React.CSSProperties}
						>
							<span aria-hidden="true" className="nf-badge-dot" />
							Error 404
						</span>

						<h1
							className="nf-appear"
							style={{ "--d": "0.28s" } as React.CSSProperties}
						>
							This line went <em>dead</em>.
						</h1>

						<p
							className="nf-lede nf-appear"
							style={{ "--d": "0.44s" } as React.CSSProperties}
						>
							The page you dialled is no longer in service. Nothing was lost —
							it simply is not here.
						</p>

						<div
							className="nf-actions nf-appear"
							style={{ "--d": "0.58s" } as React.CSSProperties}
						>
							<Link className="nf-btn nf-solid" href="/">
								Back to home
							</Link>
							<Link className="nf-btn nf-ghost" href="/dashboard">
								Go to dashboard
							</Link>
						</div>
					</div>
				</main>

				<footer
					className="nf-foot nf-appear"
					style={{ "--d": "0.72s" } as React.CSSProperties}
				>
					Looking for something specific? Start from the{" "}
					<Link href="/">landing page</Link>.
				</footer>
			</div>
		</>
	);
}
