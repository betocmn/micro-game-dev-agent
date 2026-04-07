import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import ConvexClientProvider from "./ConvexClientProvider";
import "./globals.css";

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Roblox Harness MVP",
	description:
		"Turn a vague prompt into a Rojo scaffold, trace, and eval suite.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${geistMono.variable} h-full antialiased`}>
			<body className="min-h-full flex flex-col bg-gray-950 text-gray-100 font-mono">
				<ConvexClientProvider>{children}</ConvexClientProvider>
			</body>
		</html>
	);
}
