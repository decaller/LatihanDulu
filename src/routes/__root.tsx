import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { RiBookOpenLine, RiFolderLine, RiFileList3Line } from "@remixicon/react"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "LatihanDulu - Evaluasi Syar'i Terpadu",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16 text-center">
      <h1 className="text-4xl font-extrabold text-foreground mb-2">404</h1>
      <p className="text-muted-foreground mb-4">Afwan, halaman yang antum cari tidak ditemukan.</p>
      <Link to="/" className="inline-flex rounded-lg bg-emerald-600 text-white font-bold text-xs px-4 py-2 hover:bg-emerald-700">
        Kembali ke Beranda
      </Link>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        {/* Global Floating Glass Navbar */}
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600 font-extrabold text-xs tracking-tight border border-emerald-500/20">
                TD
              </span>
              <span className="font-sans font-bold text-sm tracking-tight text-foreground select-none">
                TesDeen
              </span>
            </div>

            <nav className="flex items-center gap-1 sm:gap-2">
              <Link
                to="/"
                activeOptions={{ exact: true }}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-muted hover:text-foreground [&.active]:bg-emerald-500/10 [&.active]:text-emerald-600 [&.active]:border [&.active]:border-emerald-500/15"
              >
                <RiBookOpenLine className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xs:inline">Beranda</span>
              </Link>

              <Link
                to="/semua"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-muted hover:text-foreground [&.active]:bg-emerald-500/10 [&.active]:text-emerald-600 [&.active]:border [&.active]:border-emerald-500/15"
              >
                <RiFileList3Line className="h-3.5 w-3.5 shrink-0" />
                <span>Analisis Soal</span>
              </Link>

              <Link
                to="/silsilah"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-muted hover:text-foreground [&.active]:bg-emerald-500/10 [&.active]:text-emerald-600 [&.active]:border [&.active]:border-emerald-500/15"
              >
                <RiFolderLine className="h-3.5 w-3.5 shrink-0" />
                <span>Kelola Silsilah</span>
              </Link>
            </nav>
          </div>
        </header>

        {children}
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

