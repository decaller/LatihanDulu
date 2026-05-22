import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  RiSearchLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiBookOpenLine,
  RiFileList3Line,
  RiQuestionLine,
  RiCheckLine,
  RiCloseLine,
  RiInformationLine,
  RiSparklingLine,
  RiArrowRightLine,
  RiDeleteBinLine,
  RiHistoryLine,
} from "@remixicon/react"


// TypeScript Interfaces
interface Question {
  id: number
  article_id: number
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string
  article_title: string
  article_url: string
  article_silsilah: string
  article_speaker: string
  breadcrumbs: { title: string; url: string }[]
  deleted_at: string | null
}

interface HierarchyNode {
  title: string
  url: string
  children: Map<string, HierarchyNode>
  isLeaf: boolean
  articleId?: number
}

// Server-Side Data Fetching using Bun's Native Fast SQLite
export const getQuizDataFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { Database } = (await import("bun:sqlite" as any)) as any
    const db = new Database("/home/abuhafi/Project/TesDeen/backend/data.db")

    try {
      // 1. Fetch questions joined with article info
      const rawQuestions = db
        .query(
          `
      SELECT 
        q.id,
        q.article_id,
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_option,
        q.explanation,
        q.deleted_at,
        a.title AS article_title,
        a.url AS article_url,
        a.silsilah AS article_silsilah,
        a.speaker AS article_speaker
      FROM questions q
      JOIN articles a ON q.article_id = a.id
    `
        )
        .all() as any[]

      // 2. Fetch hierarchy maps for breadcrumbs resolution
      const hierarchyRows = db
        .query("SELECT parent_url, child_url, title FROM hierarchy")
        .all() as any[]
      const articleRows = db
        .query("SELECT id, url, title FROM articles")
        .all() as any[]

      // Normalize URLs to avoid trailing slash discrepancies
      const childToParentMap = new Map<
        string,
        { parent_url: string; title: string }
      >()
      for (const row of hierarchyRows) {
        if (row.child_url) {
          childToParentMap.set(row.child_url.trim().replace(/\/$/, ""), {
            parent_url: row.parent_url.trim().replace(/\/$/, ""),
            title: row.title,
          })
        }
      }

      const articleUrlToTitleMap = new Map<string, string>()
      for (const row of articleRows) {
        if (row.url) {
          articleUrlToTitleMap.set(row.url.trim().replace(/\/$/, ""), row.title)
        }
      }

      // Trace breadcrumb trail recursively up to root
      const getBreadcrumbs = (url: string) => {
        const crumbs: { title: string; url: string }[] = []
        let currentUrl = url.trim().replace(/\/$/, "")
        const visited = new Set<string>()

        while (currentUrl && !visited.has(currentUrl)) {
          visited.add(currentUrl)
          const parentInfo = childToParentMap.get(currentUrl)
          if (!parentInfo) {
            const title = articleUrlToTitleMap.get(currentUrl) || currentUrl
            crumbs.unshift({ title, url: currentUrl })
            break
          }
          crumbs.unshift({
            title:
              parentInfo.title ||
              articleUrlToTitleMap.get(currentUrl) ||
              currentUrl,
            url: currentUrl,
          })
          currentUrl = parentInfo.parent_url
        }

        crumbs.unshift({ title: "Mulai (Root)", url: "https://ilmiyyah.com" })
        return crumbs
      }

      const questions: Question[] = rawQuestions.map((q) => ({
        ...q,
        breadcrumbs: getBreadcrumbs(q.article_url),
      }))

      const activeQuestions = questions.filter(q => !q.deleted_at)
      const deletedQuestions = questions.filter(q => q.deleted_at)

      return {
        questions,
        stats: {
          totalQuestions: activeQuestions.length,
          totalDeletedQuestions: deletedQuestions.length,
          totalArticlesWithQuestions: new Set(
            activeQuestions.map((q) => q.article_id)
          ).size,
          totalDatabaseArticles: articleRows.length,
        },
      }
    } catch (error: any) {
      console.error("Database query failed:", error)
      throw new Error("Failed to load database: " + error.message)
    } finally {
      db.close()
    }
  }
)

export const softDeleteQuestionFn = (createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const id = ctx.data
    const { Database } = (await import("bun:sqlite" as any)) as any
    const db = new Database("/home/abuhafi/Project/TesDeen/backend/data.db")
    try {
      db.query("UPDATE questions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id)
      return { success: true }
    } catch (error: any) {
      console.error("Soft delete failed:", error)
      throw new Error("Failed to soft delete question: " + error.message)
    } finally {
      db.close()
    }
  })) as any

export const restoreQuestionFn = (createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const id = ctx.data
    const { Database } = (await import("bun:sqlite" as any)) as any
    const db = new Database("/home/abuhafi/Project/TesDeen/backend/data.db")
    try {
      db.query("UPDATE questions SET deleted_at = NULL WHERE id = ?").run(id)
      return { success: true }
    } catch (error: any) {
      console.error("Restore failed:", error)
      throw new Error("Failed to restore question: " + error.message)
    } finally {
      db.close()
    }
  })) as any

export const hardDeleteQuestionFn = (createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const id = ctx.data
    const { Database } = (await import("bun:sqlite" as any)) as any
    const db = new Database("/home/abuhafi/Project/TesDeen/backend/data.db")
    try {
      db.query("DELETE FROM questions WHERE id = ?").run(id)
      return { success: true }
    } catch (error: any) {
      console.error("Hard delete failed:", error)
      throw new Error("Failed to permanently delete question: " + error.message)
    } finally {
      db.close()
    }
  })) as any

// TanStack Router definition
export const Route = createFileRoute("/semua")({
  loader: async () => {
    return await getQuizDataFn()
  },
  component: SemuaDashboard,
})

// Collapsible Folder Tree Component
function HierarchyFolderTree({
  node,
  activeFilter,
  onSelectNode,
  expandedNodes,
  toggleExpand,
}: {
  node: HierarchyNode
  activeFilter: string | null
  onSelectNode: (url: string | null) => void
  expandedNodes: Set<string>
  toggleExpand: (url: string) => void
}) {
  const isExpanded = expandedNodes.has(node.url)
  const isSelected = activeFilter === node.url
  const hasChildren = node.children.size > 0

  return (
    <div className="pl-3 select-none">
      <div
        className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-all ${
          isSelected
            ? "border border-primary/20 bg-primary/10 font-medium text-primary"
            : "border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        onClick={() =>
          onSelectNode(node.url === "https://ilmiyyah.com" ? null : node.url)
        }
      >
        {hasChildren ? (
          <span
            className="rounded p-0.5 transition-colors hover:bg-muted-foreground/10"
            onClick={(e) => {
              e.stopPropagation()
              toggleExpand(node.url)
            }}
          >
            {isExpanded ? (
              <RiArrowDownSLine className="h-3.5 w-3.5" />
            ) : (
              <RiArrowRightSLine className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="w-4" />
        )}

        {hasChildren ? (
          isExpanded ? (
            <RiFolderOpenLine className="h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <RiFolderLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
          )
        ) : (
          <RiBookOpenLine className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        )}

        <span className="max-w-[180px] truncate font-sans" title={node.title}>
          {node.title}
        </span>
      </div>

      {hasChildren && isExpanded && (
        <div className="animate-fadeIn mt-0.5 ml-2 space-y-0.5 border-l border-muted pl-1">
          {Array.from(node.children.values()).map((child) => (
            <HierarchyFolderTree
              key={child.url}
              node={child}
              activeFilter={activeFilter}
              onSelectNode={onSelectNode}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SemuaDashboard() {
  const { questions, stats } = Route.useLoaderData()

  // State Management
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilterUrl, setActiveFilterUrl] = useState<string | null>(null)
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(
    null
  )
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(["https://ilmiyyah.com"])
  )
  const [viewTab, setViewTab] = useState<"active" | "deleted">("active")

  // Build the Folder Tree from active breadcrumbs dynamically
  const folderTree = useMemo(() => {
    const root: HierarchyNode = {
      title: "Mulai (Root)",
      url: "https://ilmiyyah.com",
      children: new Map(),
      isLeaf: false,
    }

    const targetQuestions = questions.filter(q => viewTab === "active" ? !q.deleted_at : !!q.deleted_at)

    for (const q of targetQuestions) {
      let current = root
      for (let i = 1; i < q.breadcrumbs.length; i++) {
        const crumb = q.breadcrumbs[i]
        const cleanUrl = crumb.url.trim().replace(/\/$/, "")
        if (!current.children.has(cleanUrl)) {
          current.children.set(cleanUrl, {
            title: crumb.title,
            url: cleanUrl,
            children: new Map(),
            isLeaf: i === q.breadcrumbs.length - 1,
            articleId:
              i === q.breadcrumbs.length - 1 ? q.article_id : undefined,
          })
        }
        current = current.children.get(cleanUrl)!
      }
    }
    return root
  }, [questions, viewTab])

  // Tree Expand/Collapse handler
  const toggleExpand = (url: string) => {
    const next = new Set(expandedNodes)
    if (next.has(url)) {
      next.delete(url)
    } else {
      next.add(url)
    }
    setExpandedNodes(next)
  }

  // Filter Questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      // 0. Soft Delete Filter
      const matchesTab = viewTab === "active" ? !q.deleted_at : !!q.deleted_at
      if (!matchesTab) return false

      // 1. Search Query Filter
      const query = searchTerm.toLowerCase().trim()
      const matchesSearch =
        query === "" ||
        q.question_text.toLowerCase().includes(query) ||
        q.option_a.toLowerCase().includes(query) ||
        q.option_b.toLowerCase().includes(query) ||
        q.option_c.toLowerCase().includes(query) ||
        q.option_d.toLowerCase().includes(query) ||
        q.explanation.toLowerCase().includes(query) ||
        q.article_title.toLowerCase().includes(query)

      // 2. Hierarchy Node Filter (Check if activeFilterUrl exists in breadcrumbs)
      const matchesHierarchy =
        !activeFilterUrl ||
        q.breadcrumbs.some(
          (crumb) =>
            crumb.url.trim().replace(/\/$/, "") ===
            activeFilterUrl.trim().replace(/\/$/, "")
        )

      return matchesSearch && matchesHierarchy
    })
  }, [questions, searchTerm, activeFilterUrl, viewTab])

  // Quick select category name
  const currentCategoryName = useMemo(() => {
    if (!activeFilterUrl) return "Semua Materi"
    if (activeFilterUrl === "https://ilmiyyah.com") return "Mulai (Root)"

    // Find name from question breadcrumbs
    for (const q of questions) {
      const crumb = q.breadcrumbs.find(
        (c) =>
          c.url.trim().replace(/\/$/, "") ===
          activeFilterUrl.trim().replace(/\/$/, "")
      )
      if (crumb) return crumb.title
    }
    return activeFilterUrl
  }, [activeFilterUrl, questions])

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      {/* Header Panel */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5 text-primary">
              <RiSparklingLine className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Bismillah. Analisis Soal
              </h1>
              <p className="text-xs text-muted-foreground">
                Portal evaluasi terpadu materi kajian Ilmiyyah
              </p>
            </div>
          </div>

          {/* Quick stats badges */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => {
                setViewTab("active")
                setActiveFilterUrl(null)
              }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 text-xs shadow-xs transition-all ${
                viewTab === "active"
                  ? "border-primary/20 bg-primary/10 font-semibold text-primary"
                  : "border-border bg-card text-card-foreground hover:bg-muted"
              }`}
            >
              <RiFileList3Line className="h-4 w-4 text-primary" />
              <div>
                <span className="font-semibold">{stats.totalQuestions}</span>
                <span className="ml-1 text-muted-foreground">Soal Aktif</span>
              </div>
            </button>

            <button
              onClick={() => {
                setViewTab("deleted")
                setActiveFilterUrl(null)
              }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 text-xs shadow-xs transition-all ${
                viewTab === "deleted"
                  ? "border-amber-500/20 bg-amber-500/10 font-semibold text-amber-600 animate-pulse"
                  : "border-border bg-card text-card-foreground hover:bg-muted"
              }`}
            >
              <RiDeleteBinLine className="h-4 w-4 text-amber-500" />
              <div>
                <span className="font-semibold">{stats.totalDeletedQuestions || 0}</span>
                <span className="ml-1 text-muted-foreground">Sampah</span>
              </div>
            </button>

            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5 text-card-foreground shadow-xs">
              <RiBookOpenLine className="h-4 w-4 text-emerald-600" />
              <div className="text-xs">
                <span className="font-semibold text-foreground">
                  {stats.totalArticlesWithQuestions}
                </span>
                <span className="ml-1 text-muted-foreground">
                  Kajian Terbit
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-1.5 text-card-foreground shadow-xs">
              <RiFolderLine className="h-4 w-4 text-amber-500" />
              <div className="text-xs">
                <span className="font-semibold text-foreground">
                  {stats.totalDatabaseArticles}
                </span>
                <span className="ml-1 text-muted-foreground">
                  Total Transkrip
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6 md:flex-row">
        {/* Left Side: Collapsible Category Tree Sidebar */}
        <aside className="flex w-full shrink-0 flex-col gap-4 md:w-64">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <RiFolderLine className="h-4 w-4" />
                Struktur Kajian
              </span>
              {activeFilterUrl && (
                <button
                  onClick={() => setActiveFilterUrl(null)}
                  className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground transition-all hover:bg-muted-foreground/15"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Tree Root */}
            <div className="max-h-[350px] space-y-1 overflow-y-auto pr-1 md:max-h-[500px]">
              <HierarchyFolderTree
                node={folderTree}
                activeFilter={activeFilterUrl}
                onSelectNode={setActiveFilterUrl}
                expandedNodes={expandedNodes}
                toggleExpand={toggleExpand}
              />
            </div>
          </div>

          {/* Quick tips card */}
          <div className="hidden flex-col gap-1.5 rounded-xl border border-border bg-primary/5 p-4 text-primary md:flex">
            <span className="flex items-center gap-1 text-xs font-semibold">
              <RiInformationLine className="h-3.5 w-3.5" />
              Analisis Mandiri
            </span>
            <p className="text-[11px] leading-relaxed text-primary/80">
              Gunakan struktur kajian untuk memfilter soal per silsilah atau
              sub-materi. Klik breadcrumbs pada baris tabel untuk menavigasi
              tingkat tertentu.
            </p>
          </div>
        </aside>

        {/* Right Side: Big Table Pane */}
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Controls Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <RiSearchLine className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari kata kunci soal, artikel, opsi, atau penjelasan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-1.5 pr-8 pl-9 text-sm text-ellipsis transition-all focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-all hover:bg-muted"
                >
                  <RiCloseLine className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Active filtering indicator */}
            <div className="flex shrink-0 items-center gap-2 self-start text-xs sm:self-center">
              <span className="text-muted-foreground">Menampilkan:</span>
              <span className="max-w-[200px] truncate rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                {currentCategoryName}
              </span>
              <span className="text-muted-foreground">
                ({filteredQuestions.length} hasil)
              </span>
            </div>
          </div>

          {/* Large Data Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/70 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase select-none">
                    <th className="w-12 p-4 text-center">ID</th>
                    <th className="max-w-[250px] p-4">Soal Evaluasi</th>
                    <th className="hidden max-w-[200px] p-4 md:table-cell">
                      Struktur Breadcrumb
                    </th>
                    <th className="hidden w-[320px] p-4 lg:table-cell">
                      Pilihan Opsi
                    </th>
                    <th className="w-20 p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredQuestions.length > 0 ? (
                    filteredQuestions.map((q) => (
                      <tr
                        key={q.id}
                        className="group cursor-pointer transition-colors hover:bg-muted/30"
                        onClick={() => setSelectedQuestion(q)}
                      >
                        {/* ID */}
                        <td className="p-4 text-center font-mono text-xs text-muted-foreground">
                          {q.id}
                        </td>

                        {/* Soal */}
                        <td className="max-w-[250px] p-4">
                          <div className="flex flex-col gap-1">
                            <span
                              className="line-clamp-2 leading-relaxed font-medium text-foreground"
                              title={q.question_text}
                            >
                              {q.question_text}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <RiFileList3Line className="h-3 w-3 text-emerald-600" />
                              <span
                                className="max-w-[220px] truncate"
                                title={q.article_title}
                              >
                                {q.article_title}
                              </span>
                            </span>
                          </div>
                        </td>

                        {/* Breadcrumbs */}
                        <td className="vertical-align-middle hidden max-w-[200px] p-4 md:table-cell">
                          <div className="flex flex-wrap items-center gap-1 overflow-hidden">
                            {q.breadcrumbs.slice(0, 3).map((crumb, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-0.5 text-[10px]"
                              >
                                {idx > 0 && (
                                  <RiArrowRightSLine className="h-2.5 w-2.5 text-muted-foreground/60" />
                                )}
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActiveFilterUrl(
                                      crumb.url === "https://ilmiyyah.com"
                                        ? null
                                        : crumb.url
                                    )
                                  }}
                                  className="max-w-[100px] truncate rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
                                  title={crumb.title}
                                >
                                  {crumb.title}
                                </span>
                              </div>
                            ))}
                            {q.breadcrumbs.length > 3 && (
                              <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                                +{q.breadcrumbs.length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Opsi */}
                        <td className="hidden max-w-[320px] p-4 text-xs lg:table-cell">
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { label: "A", val: q.option_a },
                              { label: "B", val: q.option_b },
                              { label: "C", val: q.option_c },
                              { label: "D", val: q.option_d },
                            ].map((opt) => {
                              const isCorrect =
                                q.correct_option.toUpperCase() === opt.label
                              return (
                                <div
                                  key={opt.label}
                                  className={`flex items-center gap-1.5 truncate rounded-md border p-1 px-2 ${
                                    isCorrect
                                      ? "border-emerald-500/20 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-400"
                                      : "border-border bg-background text-muted-foreground/90"
                                  }`}
                                  title={`${opt.label}. ${opt.val}`}
                                >
                                  <span
                                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                                      isCorrect
                                        ? "bg-emerald-500 text-white"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {opt.label}
                                  </span>
                                  <span className="truncate">{opt.val}</span>
                                </div>
                              )
                            })}
                          </div>
                        </td>

                        {/* Action Buttons */}
                        <td
                          className="p-4 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-primary cursor-pointer"
                              onClick={() => setSelectedQuestion(q)}
                              title="Analisis Detail"
                            >
                              <RiInformationLine className="h-4 w-4" />
                            </Button>

                            {viewTab === "active" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
                                onClick={async () => {
                                  if (confirm("Arsipkan/hapus sementara soal ini?")) {
                                    await softDeleteQuestionFn({ data: q.id })
                                    window.location.reload()
                                  }
                                }}
                                title="Hapus Sementara"
                              >
                                <RiDeleteBinLine className="h-4 w-4" />
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg text-muted-foreground transition-all hover:bg-emerald-500/10 hover:text-emerald-600 cursor-pointer"
                                  onClick={async () => {
                                    await restoreQuestionFn({ data: q.id })
                                    window.location.reload()
                                  }}
                                  title="Pulihkan Soal"
                                >
                                  <RiHistoryLine className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg text-muted-foreground transition-all hover:bg-red-600/15 hover:text-red-700 cursor-pointer"
                                  onClick={async () => {
                                    if (confirm("HAPUS PERMANEN? Tindakan ini tidak bisa dibatalkan.")) {
                                      await hardDeleteQuestionFn({ data: q.id })
                                      window.location.reload()
                                    }
                                  }}
                                  title="Hapus Permanen"
                                >
                                  <RiCloseLine className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-12 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RiFileList3Line className="h-8 w-8 animate-bounce text-muted-foreground/60" />
                          <p className="text-sm font-medium">
                            Tidak ada soal evaluasi ditemukan
                          </p>
                          <p className="text-xs text-muted-foreground/80">
                            Cobalah mereset pencarian atau filter silsilah
                            kajian Anda.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Slide-over Detailed Question Inspector Drawer/Modal */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-background/60 backdrop-blur-xs select-none">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() => setSelectedQuestion(null)}
          />

          <div className="animate-slideLeft relative flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 p-5">
              <div className="flex items-center gap-2">
                <RiQuestionLine className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Detail Analisis Soal #{selectedQuestion.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedQuestion(null)}
                className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted cursor-pointer"
              >
                <RiCloseLine className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {selectedQuestion.deleted_at && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <RiDeleteBinLine className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Soal ini berada di Tempat Sampah (Terarsipkan)</span>
                    <p className="mt-0.5 text-[10px] text-amber-600/80">
                      Dihapus pada: {new Date(selectedQuestion.deleted_at).toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
              )}
              {/* Hierarchy Path / Breadcrumbs trail */}
              <div className="space-y-1.5">
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <RiFolderLine className="h-3.5 w-3.5" />
                  Struktur Materi
                </span>
                <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-2.5 text-xs leading-normal">
                  {selectedQuestion.breadcrumbs.map((crumb, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      {idx > 0 && (
                        <RiArrowRightSLine className="h-3 w-3 text-muted-foreground/60" />
                      )}
                      <span className="font-medium text-muted-foreground/90">
                        {crumb.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main Question Text Block */}
              <div className="space-y-2">
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Pertanyaan
                </span>
                <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm leading-relaxed font-semibold text-foreground">
                  {selectedQuestion.question_text}
                </div>
              </div>

              {/* Options details list */}
              <div className="space-y-3">
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Pilihan Jawaban
                </span>
                <div className="space-y-2 text-xs">
                  {[
                    { label: "A", val: selectedQuestion.option_a },
                    { label: "B", val: selectedQuestion.option_b },
                    { label: "C", val: selectedQuestion.option_c },
                    { label: "D", val: selectedQuestion.option_d },
                  ].map((opt) => {
                    const isCorrect =
                      selectedQuestion.correct_option.toUpperCase() ===
                      opt.label
                    return (
                      <div
                        key={opt.label}
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${
                          isCorrect
                            ? "border-emerald-500/20 bg-emerald-500/10 font-medium text-emerald-800 shadow-2xs dark:text-emerald-400"
                            : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            isCorrect
                              ? "bg-emerald-500 text-white"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span className="leading-relaxed">{opt.val}</span>
                        {isCorrect && (
                          <RiCheckLine className="ml-auto h-4 w-4 shrink-0 self-center text-emerald-600" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Comprehensive explanation */}
              <div className="space-y-2">
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <RiInformationLine className="h-3.5 w-3.5" />
                  Keterangan & Penjelasan Ilmiah
                </span>
                <div className="rounded-xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
                  {selectedQuestion.explanation ||
                    "Tidak ada penjelasan tambahan yang tersedia."}
                </div>
              </div>

              {/* Source Lecture Metadata Panel */}
              <div className="space-y-2">
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Sumber Rujukan Kajian
                </span>
                <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">
                      Judul Artikel:
                    </span>
                    <span
                      className="max-w-[250px] truncate font-semibold text-foreground"
                      title={selectedQuestion.article_title}
                    >
                      {selectedQuestion.article_title}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Pembicara:</span>
                    <span className="font-semibold text-foreground">
                      {selectedQuestion.article_speaker}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Silsilah:</span>
                    <span className="max-w-[250px] truncate font-semibold text-foreground">
                      {selectedQuestion.article_silsilah || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                    <span className="text-muted-foreground">Tautan Web:</span>
                    <a
                      href={selectedQuestion.article_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex max-w-[280px] items-center gap-0.5 truncate font-medium text-primary hover:underline"
                    >
                      {selectedQuestion.article_url.replace("https://", "")}
                      <RiArrowRightLine className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="flex justify-between items-center border-t border-border bg-muted/30 p-4">
              <div className="flex gap-2">
                {selectedQuestion.deleted_at ? (
                  <>
                    <Button
                      onClick={async () => {
                        await restoreQuestionFn({ data: selectedQuestion.id })
                        window.location.reload()
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-1.5 font-medium rounded-lg cursor-pointer"
                    >
                      Pulihkan Soal
                    </Button>
                    <Button
                      onClick={async () => {
                        if (confirm("HAPUS PERMANEN? Tindakan ini tidak bisa dibatalkan.")) {
                          await hardDeleteQuestionFn({ data: selectedQuestion.id })
                          window.location.reload()
                        }
                      }}
                      className="bg-red-700 hover:bg-red-800 text-white text-xs px-3.5 py-1.5 font-medium rounded-lg cursor-pointer"
                    >
                      Hapus Permanen
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={async () => {
                      if (confirm("Arsipkan/hapus sementara soal ini?")) {
                        await softDeleteQuestionFn({ data: selectedQuestion.id })
                        window.location.reload()
                      }
                    }}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-600 text-xs px-3.5 py-1.5 font-medium rounded-lg border border-red-500/20 cursor-pointer"
                  >
                    Arsipkan Soal
                  </Button>
                )}
              </div>

              <Button
                onClick={() => setSelectedQuestion(null)}
                className="bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/95 cursor-pointer"
              >
                Selesai
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
