import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Space_Grotesk } from "next/font/google";

import "../index.css";
import { cn } from "@doki/ui/lib/utils";
import Header from "@/components/header";
import Providers from "@/components/providers";

const spaceGroteskHeading = Space_Grotesk({
	subsets: ["latin"],
	variable: "--font-heading",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "doki",
	description: "doki",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={cn("font-sans", inter.variable, spaceGroteskHeading.variable)}
		>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<Providers>
					<div className="grid h-svh grid-rows-[auto_1fr]">
						<Header />
						{children}
					</div>
				</Providers>
			</body>
		</html>
	);
}
