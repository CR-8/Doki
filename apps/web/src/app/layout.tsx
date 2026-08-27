import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Inter } from "next/font/google";

import "../index.css";
import { cn } from "@doki/ui/lib/utils";
import Providers from "@/components/providers";

// DM Sans carries every role, 80px display down to 12px micro labels.
const dmSans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-dm-sans",
	weight: ["400", "500", "600", "700"],
});

// Documented fallback only; never used as a second display face.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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
			className={cn("font-sans", dmSans.variable, inter.variable)}
		>
			<body className={`${geistMono.variable} antialiased`}>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
