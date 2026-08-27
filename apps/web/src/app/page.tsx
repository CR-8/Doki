import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import Link from "next/link";

import CtaFaq from "@/components/landing/cta-faq";
import Features from "@/components/landing/features";
import HowItWorks from "@/components/landing/how-it-works";
import SiteFooter from "@/components/landing/site-footer";
import Testimonials from "@/components/landing/testimonials";
import VesperMotion from "@/components/landing/vesper-motion";

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

const FAVICON =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cg transform='rotate(-30 12 12)'%3E%3Ccircle cx='7.3' cy='3.2' r='1.45'/%3E%3Crect x='5.5' y='4.7' width='3.6' height='14.6' rx='1.8'/%3E%3Crect x='14.9' y='4.7' width='3.6' height='14.6' rx='1.8'/%3E%3Ccircle cx='16.7' cy='20.8' r='1.45'/%3E%3C/g%3E%3C/svg%3E";

const HERO_MEDIA =
	"https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4";

export const metadata: Metadata = {
	title: "doki — AI Calling Infrastructure",
	description:
		"Deploy voice agents that dial, qualify, and follow up on every lead — inside your calling windows, consent rules, and DNC list.",
	icons: { icon: FAVICON },
};

const CSS = `
html, body { background: #000000 !important; color: #ffffff; }

/* The element-level reset lives in Tailwind's base layer: unlayered rules beat
   every layered utility, so an unlayered universal reset here would silently
   kill the spacing utilities the features section is built from. */
@layer base {
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
}

:root {
  --bg: #000000;
  --text: #ffffff;
  --muted: #9a9a9a;
  --stat: #d8d8d8;
  --border: rgba(255, 255, 255, 0.16);
  --border-soft: rgba(255, 255, 255, 0.12);

  --logo: 15.5px;
  --logo-mark: 22px;
  --nav: 14px;
  --nav-h: 40px;
  --btn: 13.5px;
  --btn-h: 40px;
  --hero-btn-h: 42px;
  --h1: 48px;
  --lede: 15.5px;
  --badge: 12.5px;
  --stat-size: 13.5px;
  --header-y: 22px;
  --header-x: 40px;
  --stats-x: 72px;
  --stats-y: 36px;
  --hero-gap: 85px;
  --copy-max: 860px;
  --lede-max: 470px;

  --font-ui: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: "Instrument Serif", "Times New Roman", Times, serif;
}

html { scroll-behavior: smooth; }

html, body {
  background: #000000;
  background: var(--bg, #000000);
  color: #ffffff;
  color: var(--text, #ffffff);
}

@layer base {
  body {
    font-family: var(--font-ui);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
    position: relative;
  }

  a { color: inherit; text-decoration: none; }
  button { font-family: inherit; }
  svg { display: block; }
}

/* ---------------- layers ---------------- */

.grain {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  opacity: 0.05;
}
.grain svg { width: 100%; height: 100%; }

.hero-photo {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  animation: in-photo 1.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.hero-photo video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 1;
}
.hero-photo::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 46%, rgba(0, 0, 0, 0.55) 100%);
}
.hero-photo.is-in {
  animation: none;
  opacity: 1;
  transform: none;
  clip-path: none;
  filter: none;
}

/* The self-hosted faces land on .page, so the tokens are re-declared here —
   a var() in :root cannot reach a custom property defined further down. */
/* Everything under the hero rides on one opaque surface, so it scrolls up over
   the fixed hero media instead of letting it show through. */
.below-fold {
  --font-ui: var(--vesper-sans), "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: var(--vesper-serif), "Instrument Serif", "Times New Roman", Times, serif;
  font-family: var(--font-ui);
  position: relative;
  z-index: 2;
  background: #000000;
}

/* ---------------- animated gradient CTA ---------------- */

@property --c5-x1 { syntax: '<percentage>'; inherits: false; initial-value: 10%; }
@property --c5-y1 { syntax: '<percentage>'; inherits: false; initial-value: 10%; }
@property --c5-x2 { syntax: '<percentage>'; inherits: false; initial-value: 90%; }
@property --c5-y2 { syntax: '<percentage>'; inherits: false; initial-value: 10%; }
@property --c5-x3 { syntax: '<percentage>'; inherits: false; initial-value: 10%; }
@property --c5-y3 { syntax: '<percentage>'; inherits: false; initial-value: 90%; }
@property --c5-x4 { syntax: '<percentage>'; inherits: false; initial-value: 90%; }
@property --c5-y4 { syntax: '<percentage>'; inherits: false; initial-value: 90%; }
@property --c5-x5 { syntax: '<percentage>'; inherits: false; initial-value: 50%; }
@property --c5-y5 { syntax: '<percentage>'; inherits: false; initial-value: 50%; }
@property --c5-s1 { syntax: '<percentage>'; inherits: false; initial-value: 55%; }
@property --c5-s2 { syntax: '<percentage>'; inherits: false; initial-value: 55%; }
@property --c5-s3 { syntax: '<percentage>'; inherits: false; initial-value: 55%; }
@property --c5-s4 { syntax: '<percentage>'; inherits: false; initial-value: 55%; }
@property --c5-s5 { syntax: '<percentage>'; inherits: false; initial-value: 65%; }

.c5-animated-gradient {
  background-color: #ff8e53;
  background-image:
    radial-gradient(circle at var(--c5-x1) var(--c5-y1), #fff1aa 0px, transparent var(--c5-s1)),
    radial-gradient(circle at var(--c5-x2) var(--c5-y2), #ff4b2b 0px, transparent var(--c5-s2)),
    radial-gradient(circle at var(--c5-x3) var(--c5-y3), #8aff8a 0px, transparent var(--c5-s3)),
    radial-gradient(circle at var(--c5-x4) var(--c5-y4), #ffd000 0px, transparent var(--c5-s4)),
    radial-gradient(circle at var(--c5-x5) var(--c5-y5), #ff1493 0px, transparent var(--c5-s5));
  animation:
    c5-blob1 5s ease-in-out infinite,
    c5-blob2 6s ease-in-out infinite,
    c5-blob3 5.5s ease-in-out infinite,
    c5-blob4 6.5s ease-in-out infinite,
    c5-blob5 4s ease-in-out infinite,
    c5-size1 3.5s ease-in-out infinite,
    c5-size2 4.2s ease-in-out infinite,
    c5-size3 3.8s ease-in-out infinite,
    c5-size4 4.6s ease-in-out infinite,
    c5-size5 3s ease-in-out infinite;
}

@keyframes c5-blob1 {
  0%,100% { --c5-x1: 5%;  --c5-y1: 5%;  }
  25%     { --c5-x1: 45%; --c5-y1: 20%; }
  50%     { --c5-x1: 30%; --c5-y1: 55%; }
  75%     { --c5-x1: 0%;  --c5-y1: 30%; }
}
@keyframes c5-blob2 {
  0%,100% { --c5-x2: 95%; --c5-y2: 5%;  }
  33%     { --c5-x2: 55%; --c5-y2: 35%; }
  66%     { --c5-x2: 80%; --c5-y2: 65%; }
}
@keyframes c5-blob3 {
  0%,100% { --c5-x3: 5%;  --c5-y3: 95%; }
  40%     { --c5-x3: 45%; --c5-y3: 65%; }
  70%     { --c5-x3: 25%; --c5-y3: 100%; }
}
@keyframes c5-blob4 {
  0%,100% { --c5-x4: 95%; --c5-y4: 95%; }
  30%     { --c5-x4: 60%; --c5-y4: 70%; }
  60%     { --c5-x4: 100%; --c5-y4: 50%; }
}
@keyframes c5-blob5 {
  0%,100% { --c5-x5: 50%; --c5-y5: 50%; }
  25%     { --c5-x5: 70%; --c5-y5: 30%; }
  50%     { --c5-x5: 40%; --c5-y5: 70%; }
  75%     { --c5-x5: 30%; --c5-y5: 40%; }
}

@keyframes c5-size1 { 0%,100% { --c5-s1: 45%; } 50% { --c5-s1: 80%; } }
@keyframes c5-size2 { 0%,100% { --c5-s2: 45%; } 50% { --c5-s2: 85%; } }
@keyframes c5-size3 { 0%,100% { --c5-s3: 45%; } 50% { --c5-s3: 78%; } }
@keyframes c5-size4 { 0%,100% { --c5-s4: 45%; } 50% { --c5-s4: 82%; } }
@keyframes c5-size5 { 0%,100% { --c5-s5: 50%; } 50% { --c5-s5: 85%; } }

.page {
  --font-ui: var(--vesper-sans), "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display: var(--vesper-serif), "Instrument Serif", "Times New Roman", Times, serif;
  font-family: var(--font-ui);
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
  min-height: 100dvh;
}

/* ---------------- header ---------------- */

.header {
  position: relative;
  z-index: 50;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: var(--header-y) var(--header-x) 10px;
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  justify-self: start;
  font-size: var(--logo);
  font-weight: 600;
  letter-spacing: -0.03em;
  color: #ffffff;
}
.logo svg { width: var(--logo-mark); height: var(--logo-mark); flex: none; }
.logo-suffix { font-weight: 400; }

.nav {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: center;
}
.nav a {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--nav-h);
  padding: 0 18px;
  border-radius: 7px;
  border: 1px solid rgba(198, 198, 198, 0.55);
  background: linear-gradient(105deg, #050505 0%, #2a2a2a 48%, #4a4a4a 100%);
  color: #f3f3f3;
  font-size: var(--nav);
  font-weight: 400;
  letter-spacing: -0.01em;
  white-space: nowrap;
  transition: background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
}
.nav a::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.16) 50%, transparent 70%);
  transform: translateX(-120%);
  transition: transform 0.6s ease;
}
.nav a:hover::before { transform: translateX(120%); }
.nav a:hover {
  border-color: rgba(235, 235, 235, 0.9);
  background: linear-gradient(105deg, #111111 0%, #3a3a3a 45%, #6a6a6a 100%);
  box-shadow: 0 0 18px rgba(200, 210, 230, 0.18);
}

.burger {
  display: none;
  grid-auto-flow: row;
  place-items: center;
  align-content: center;
  gap: 5px;
  width: 42px;
  height: 42px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: rgba(8, 8, 8, 0.55);
  justify-self: end;
  position: relative;
  z-index: 60;
  cursor: pointer;
  transition: background 0.35s ease, border-color 0.35s ease;
}
.burger:hover {
  border-color: rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.05);
}
.burger span {
  display: block;
  width: 16px;
  height: 1.5px;
  border-radius: 1px;
  background: #ffffff;
  transition: transform 0.25s ease, opacity 0.2s ease;
}
body.menu-open .burger span:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
body.menu-open .burger span:nth-child(2) { opacity: 0; }
body.menu-open .burger span:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

/* ---------------- buttons ---------------- */

.btn {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--btn-h);
  padding: 0 16px;
  border-radius: 6px;
  font-size: var(--btn);
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease, color 0.35s ease, filter 0.35s ease;
}
.btn::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg, transparent 20%, rgba(255, 255, 255, 0.45) 48%, transparent 76%);
  transform: translateX(-130%);
  transition: transform 0.65s ease;
}
.btn:hover::after { transform: translateX(130%); }

.btn-solid {
  background: linear-gradient(180deg, #ffffff 0%, #e7e7e7 48%, #cfcfcf 100%);
  color: #111111;
  border: 1px solid #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
.btn-solid:hover {
  background: linear-gradient(180deg, #ffffff 0%, #f3f6ff 42%, #d5def2 100%);
  border-color: #f2f6ff;
  box-shadow: inset 0 1px 0 #ffffff, 0 0 22px rgba(186, 208, 255, 0.35), 0 8px 18px rgba(255, 255, 255, 0.12);
}

.btn-ghost {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.45) 50%, rgba(160, 175, 200, 0.08));
  color: #ffffff;
  border: 1px solid rgba(198, 198, 198, 0.45);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.btn-ghost:hover {
  background: linear-gradient(135deg, rgba(210, 225, 255, 0.18), rgba(0, 0, 0, 0.35) 48%, rgba(180, 195, 220, 0.16));
  border-color: rgba(220, 230, 255, 0.75);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 0 20px rgba(170, 200, 255, 0.22);
}

.header-cta { justify-self: end; }

.hero-actions .btn { height: var(--hero-btn-h); padding: 0 18px; }
.hero-actions .btn-solid:hover {
  box-shadow: inset 0 1px 0 #ffffff, 0 0 26px rgba(186, 208, 255, 0.4), 0 8px 18px rgba(255, 255, 255, 0.14);
}
.hero-actions .btn-ghost {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.5) 46%, rgba(150, 170, 200, 0.1));
  border: 1px solid rgba(198, 198, 198, 0.55);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.hero-actions .btn-ghost:hover {
  border-color: rgba(220, 230, 255, 0.8);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 0 24px rgba(170, 200, 255, 0.28);
}

/* ---------------- hero ---------------- */

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 8px 24px var(--hero-gap);
  min-height: 0;
}
.hero-copy {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: var(--copy-max);
  width: 100%;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 22px;
  padding: 9px 15px;
  border: 0;
  border-radius: 5px;
  background: linear-gradient(90deg, #7d7d7d 0%, #2a2a2a 52%, #0a0a0a 100%);
  color: #f2f2f2;
  font-size: var(--badge);
  font-weight: 400;
  letter-spacing: -0.01em;
}
.badge-star {
  width: 18px;
  height: 20px;
  flex: none;
  filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.45));
  animation: in-star 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.28s both;
}

.hero h1 {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--font-ui);
  font-size: var(--h1);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1.12;
  color: #ffffff;
}
.headline-line {
  display: block;
  overflow: hidden;
  padding: 0.06em 0.15em 0.14em;
}
.headline-line-inner { display: block; }
.hero h1 em {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 400;
  font-size: 1.08em;
  letter-spacing: -0.03em;
  color: #9a9a9a;
  animation: in-em 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.72s both;
}

.lede {
  max-width: var(--lede-max);
  margin-top: 18px;
  color: #9a9a9a;
  font-size: var(--lede);
  font-weight: 400;
  line-height: 1.55;
  letter-spacing: -0.015em;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 26px;
}

/* ---------------- stats ---------------- */

.stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 var(--stats-x) var(--stats-y);
  padding-bottom: max(var(--stats-y), env(safe-area-inset-bottom));
  color: #d8d8d8;
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  font-size: var(--stat-size);
  letter-spacing: -0.015em;
  white-space: nowrap;
}
.stat-icon { width: 20px; height: 20px; flex: none; }
.stat-icon-wide { width: 38px; height: 21px; flex: none; }

/* ---------------- mobile menu backdrop ---------------- */

.menu-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(8, 8, 8, 0.42);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.28s ease, visibility 0.28s ease, backdrop-filter 0.28s ease;
}
body.menu-open .menu-backdrop {
  opacity: 1;
  visibility: visible;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}
body.menu-open { overflow: hidden; }

/* ---------------- entrance motion ---------------- */

.appear {
  opacity: 1;
  animation-duration: 1.05s;
  animation-fill-mode: both;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  animation-delay: var(--d, 0.08s);
}
.appear--scale { animation-name: in-scale; }
.appear--soft { animation-name: in-soft; }
.appear--mask { animation-name: in-mask; }
.appear--pop { animation-name: in-pop; }
.appear--btn { animation-name: in-btn; }
.appear--side { animation-name: in-side; }
.appear--stat { animation-name: in-stat; }
.lede.appear { animation-duration: 1.25s; }
.appear.is-in {
  animation: none;
  opacity: 1;
  transform: none;
  clip-path: none;
  filter: none;
}

@keyframes in-scale {
  from { opacity: 0; transform: scale(0.84); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes in-soft {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes in-mask {
  from { opacity: 0; transform: translateY(40%); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes in-pop {
  0% { opacity: 0; transform: scale(0.9); }
  70% { opacity: 1; transform: scale(1.03); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes in-btn {
  from { opacity: 0; transform: translateY(18px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes in-side {
  from { opacity: 0; transform: translateX(22px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes in-stat {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes in-star {
  0% { opacity: 0; transform: scale(0.2) rotate(-50deg); }
  65% { opacity: 1; transform: scale(1.2) rotate(8deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
@keyframes in-em {
  from { opacity: 0.35; filter: blur(4px); }
  to { opacity: 1; filter: blur(0); }
}
@keyframes in-photo {
  from { opacity: 0; transform: scale(1.06); }
  to { opacity: 1; transform: scale(1); }
}

/* ---------------- responsive ---------------- */

@media (min-width: 1600px) {
  :root {
    --logo: 17px; --logo-mark: 24px; --nav: 15px; --nav-h: 44px;
    --btn: 15px; --btn-h: 44px; --hero-btn-h: 48px;
    --h1: 64px; --lede: 18px; --badge: 13.5px; --stat-size: 15px;
    --header-y: 28px; --header-x: 64px; --stats-x: 96px; --stats-y: 44px;
    --copy-max: 980px; --lede-max: 540px;
  }
  .nav a { padding: 0 20px; }
  .badge { margin-bottom: 26px; }
  .lede { margin-top: 22px; }
  .hero-actions { margin-top: 30px; gap: 12px; }
  .stat-icon { width: 22px; height: 22px; }
  .stat-icon-wide { width: 45px; height: 24px; }
}

@media (min-width: 1920px) {
  :root {
    --logo: 18px; --logo-mark: 26px; --nav: 16px; --nav-h: 48px;
    --btn: 16px; --btn-h: 48px; --hero-btn-h: 52px;
    --h1: 76px; --lede: 20px; --badge: 14.5px; --stat-size: 16px;
    --header-y: 32px; --header-x: 80px; --stats-x: 120px; --stats-y: 52px;
    --copy-max: 1120px; --lede-max: 620px;
  }
  .nav { gap: 10px; }
  .nav a { padding: 0 22px; }
  .btn { padding: 0 22px; }
  .badge { padding: 10px 15px; }
  .stat-icon-wide { width: 48px; height: 26px; }
}

@media (min-width: 2560px) {
  :root {
    --h1: 88px; --lede: 22px; --header-x: 120px; --stats-x: 160px;
    --copy-max: 1280px; --lede-max: 680px;
  }
}

@media (min-width: 1280px) and (max-width: 1599.98px) {
  :root {
    --h1: 54px; --lede: 16px; --header-x: 48px; --stats-x: 80px; --copy-max: 900px;
  }
}

@media (min-width: 901px) and (max-width: 1279.98px) {
  :root {
    --logo: 15px; --nav: 13px; --nav-h: 36px; --btn: 13px; --btn-h: 38px;
    --hero-btn-h: 40px; --h1: 42px; --lede: 15px; --badge: 12px; --stat-size: 12.5px;
    --header-y: 16px; --header-x: 28px; --stats-x: 36px; --stats-y: 28px;
    --hero-gap: 64px; --copy-max: 760px; --lede-max: 440px;
  }
  .nav a { padding: 0 14px; }
  .badge { margin-bottom: 16px; }
  .lede { margin-top: 14px; }
  .hero-actions { margin-top: 20px; }
}

@media (min-width: 901px) and (max-height: 850px) {
  :root { --header-y: 14px; --stats-y: 24px; --hero-gap: 48px; --h1: 40px; }
  .badge { margin-bottom: 12px; }
  .lede { margin-top: 12px; }
  .hero-actions { margin-top: 16px; }
}

@media (min-width: 901px) and (max-height: 720px) {
  :root {
    --h1: 34px; --lede: 14px; --hero-gap: 32px; --stats-y: 18px;
    --nav-h: 30px; --btn-h: 34px; --hero-btn-h: 36px;
  }
  .badge { margin-bottom: 8px; }
}

/* The hero still occupies exactly one frame on desktop, but the page scrolls
   now that the features section sits below it. */
@media (min-width: 901px) {
  .page { height: 100vh; height: 100dvh; }
}

@media (max-width: 900px) {
  html, body { height: auto; }
  :root {
    --logo: 16px; --btn: 15px; --btn-h: 46px; --hero-btn-h: 48px;
    --h1: 36px; --lede: 16.5px; --badge: 13.5px; --stat-size: 15px;
    --header-y: 16px; --header-x: 18px; --stats-x: 20px; --stats-y: 28px;
    --hero-gap: 36px;
  }
  .page { height: auto; overflow: visible; }
  .header {
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    padding-top: max(var(--header-y), env(safe-area-inset-top));
    padding-left: max(var(--header-x), env(safe-area-inset-left));
    padding-right: max(var(--header-x), env(safe-area-inset-right));
  }
  .logo, .header-cta { position: relative; z-index: 80; }
  .burger { display: grid; }
  .menu-backdrop { display: block; }
  .nav {
    position: fixed;
    inset: 0;
    z-index: 45;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 12px;
    background: transparent;
    padding: 96px 22px 32px;
    padding-top: max(96px, calc(env(safe-area-inset-top) + 88px));
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.28s ease, visibility 0.28s ease;
  }
  body.menu-open .nav { opacity: 1; visibility: visible; }
  .nav a { width: 100%; height: 56px; font-size: 19px; border-radius: 10px; }
  .hero { padding: 20px 20px 64px; }
  .hero-copy, .lede { max-width: 100%; }
  .stats { flex-direction: column; align-items: center; gap: 16px; }
  .stat { white-space: normal; }
}

@media (max-width: 560px) {
  :root { --h1: 34px; --lede: 16px; --header-x: 16px; }
  .hero-actions { flex-direction: column; }
  .hero-actions .btn { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
  .appear, .hero-photo, .hero h1 em, .badge-star {
    opacity: 1;
    transform: none;
    clip-path: none;
    filter: none;
  }
}
`;

export default function Home() {
	return (
		<>
			{/* Inline so the very first paint is already black. */}
			<style dangerouslySetInnerHTML={{ __html: CSS }} />

			<div aria-hidden="true" className="grain">
				<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
					<filter id="vesper-grain">
						<feTurbulence
							baseFrequency="0.85"
							numOctaves="3"
							stitchTiles="stitch"
							type="fractalNoise"
						/>
					</filter>
					<rect filter="url(#vesper-grain)" height="100%" width="100%" />
				</svg>
			</div>

			<div className="hero-photo">
				{/* Decorative background loop, no audio track. */}
				<video
					aria-hidden="true"
					autoPlay
					loop
					muted
					playsInline
					preload="auto"
					src={HERO_MEDIA}
					tabIndex={-1}
				/>
			</div>

			<div className={`page ${inter.variable} ${instrumentSerif.variable}`}>
				<div className="menu-backdrop" />

				<header className="header">
					<a
						aria-label="doki.ai"
						className="logo appear appear--scale"
						href="#top"
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
							doki<span className="logo-suffix">.ai</span>
						</span>
					</a>

					<nav aria-label="Primary" className="nav" id="site-nav">
						<a
							className="appear appear--scale"
							href="#how-it-works"
							style={{ "--d": "0.16s" } as React.CSSProperties}
						>
							How It Works
						</a>
						<a
							className="appear appear--soft"
							href="#features"
							style={{ "--d": "0.28s" } as React.CSSProperties}
						>
							Features
						</a>
						<a
							className="appear appear--scale"
							href="#testimonials"
							style={{ "--d": "0.40s" } as React.CSSProperties}
						>
							Customers
						</a>
						<Link
							className="appear appear--soft"
							href="/login"
							style={{ "--d": "0.52s" } as React.CSSProperties}
						>
							Sign in
						</Link>
					</nav>

					<Link
						className="btn btn-solid header-cta appear appear--scale"
						href="/login"
						style={{ "--d": "0.34s" } as React.CSSProperties}
					>
						Start for Free
					</Link>

					<button
						aria-controls="site-nav"
						aria-expanded="false"
						aria-label="Open menu"
						className="burger appear appear--scale"
						style={{ "--d": "0.34s" } as React.CSSProperties}
						type="button"
					>
						<span />
						<span />
						<span />
					</button>
				</header>

				<main className="hero" id="top">
					<div className="hero-copy">
						<span
							className="badge appear appear--pop"
							style={{ "--d": "0.22s" } as React.CSSProperties}
						>
							<svg
								aria-hidden="true"
								className="badge-star"
								fill="#ffffff"
								viewBox="0 0 24 24"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
							</svg>
							AI Calling Infrastructure
						</span>

						<h1>
							<span className="headline-line">
								<span
									className="headline-line-inner appear appear--mask"
									style={{ "--d": "0.42s" } as React.CSSProperties}
								>
									Let <em>AI agents</em> call your
								</span>
							</span>
							<span className="headline-line">
								<span
									className="headline-line-inner appear appear--mask"
									style={{ "--d": "0.62s" } as React.CSSProperties}
								>
									leads in minutes.
								</span>
							</span>
						</h1>

						<p
							className="lede appear appear--soft"
							style={{ "--d": "0.82s" } as React.CSSProperties}
						>
							Deploy voice agents that dial, qualify, and follow up on every
							lead — inside your calling windows, consent rules, and DNC list.
						</p>

						<div className="hero-actions">
							<Link
								className="btn btn-solid appear appear--btn"
								href="/login"
								style={{ "--d": "0.96s" } as React.CSSProperties}
							>
								Start for Free
							</Link>
							<a
								className="btn btn-ghost appear appear--side"
								href="#testimonials"
								style={{ "--d": "1.10s" } as React.CSSProperties}
							>
								Hear from customers
							</a>
						</div>
					</div>
				</main>

				<footer className="stats">
					<span
						className="stat appear appear--stat"
						style={{ "--d": "1.12s" } as React.CSSProperties}
					>
						<svg
							aria-hidden="true"
							className="stat-icon"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<defs>
								<linearGradient
									gradientUnits="userSpaceOnUse"
									id="vesper-flow-a"
									x1="3"
									x2="14"
									y1="2"
									y2="22"
								>
									<stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
									<stop offset="1" stopColor="#3a3a3a" stopOpacity="0.62" />
								</linearGradient>
								<linearGradient
									gradientUnits="userSpaceOnUse"
									id="vesper-flow-b"
									x1="3"
									x2="14"
									y1="2"
									y2="22"
								>
									<stop offset="0" stopColor="#3a3a3a" stopOpacity="0.38" />
									<stop offset="1" stopColor="#ffffff" stopOpacity="0.62" />
								</linearGradient>
							</defs>
							<rect
								fill="url(#vesper-flow-a)"
								height="18.8"
								rx="3.6"
								width="7.2"
								x="3.4"
								y="2.6"
							/>
							<rect
								fill="url(#vesper-flow-b)"
								height="18.8"
								rx="3.6"
								width="7.2"
								x="13.4"
								y="2.6"
							/>
							<rect
								fill="#4a4a4a"
								height="2.2"
								rx="1.1"
								width="5.6"
								x="9.2"
								y="10.9"
							/>
						</svg>
						2.6M+ calls placed
					</span>

					<span
						className="stat appear appear--stat"
						style={{ "--d": "1.28s" } as React.CSSProperties}
					>
						<svg
							aria-hidden="true"
							className="stat-icon"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<rect
								fill="#ffffff"
								height="19.2"
								rx="6.2"
								width="19.2"
								x="2.4"
								y="2.4"
							/>
							<path
								d="M12 7.1v7.4"
								stroke="#111111"
								strokeLinecap="round"
								strokeWidth="1.85"
							/>
							<path
								d="M8.15 12.35L12 16.2l3.85-3.85"
								fill="none"
								stroke="#111111"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="1.85"
							/>
						</svg>
						74% less manual dialling
					</span>

					<span
						className="stat appear appear--stat"
						style={{ "--d": "1.44s" } as React.CSSProperties}
					>
						<svg
							aria-hidden="true"
							className="stat-icon-wide"
							viewBox="0 0 40 22"
							xmlns="http://www.w3.org/2000/svg"
						>
							<circle cx="10.2" cy="11" fill="#2b2b2b" r="9.2" />
							<path d="M6.4 7.6 5.2 3.9l3.7 1.7Z" fill="#f4f4f4" />
							<path d="M14 7.6l1.2-3.7-3.7 1.7Z" fill="#f4f4f4" />
							<ellipse cx="10.2" cy="12.1" fill="#f4f4f4" rx="4.15" ry="3.7" />
							<circle cx="8.9" cy="11.6" fill="#1a1a1a" r="0.7" />
							<circle cx="11.5" cy="11.6" fill="#1a1a1a" r="0.7" />
							<circle cx="20.2" cy="11" fill="#ffffff" r="9.2" />
							<circle cx="17.4" cy="9.6" fill="#111111" r="1.7" />
							<circle cx="23" cy="9.6" fill="#111111" r="1.7" />
							<ellipse cx="20.2" cy="13" fill="#111111" rx="1.5" ry="1" />
							<path
								d="M17.6 14.6c.85 1.4 4.15 1.4 5 0"
								fill="none"
								stroke="#111111"
								strokeLinecap="round"
								strokeWidth="1.2"
							/>
							<circle cx="30.2" cy="11" fill="#f26b1d" r="9.2" />
							<text
								fill="#ffffff"
								fontFamily="var(--font-ui)"
								fontSize="12.5"
								fontWeight="700"
								textAnchor="middle"
								x="30.2"
								y="15.1"
							>
								e
							</text>
						</svg>
						240+ sales teams onboarded
					</span>
				</footer>
			</div>

			<div
				className={`below-fold ${inter.variable} ${instrumentSerif.variable}`}
			>
				<HowItWorks />
				<Features />
				<Testimonials />
				<CtaFaq />
				<SiteFooter />
			</div>

			<VesperMotion />
		</>
	);
}
