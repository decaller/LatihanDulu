import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  RiSearchLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiArrowRightSLine,
  RiArrowLeftSLine,
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
  RiFlagLine,
  RiFlagFill,
  RiAlertLine,
} from "@remixicon/react"
import { motion, AnimatePresence } from "framer-motion"

import {
  getQuizDataFn as _getQuizDataFn,
  softDeleteQuestionFn as _softDeleteQuestionFn,
  restoreQuestionFn as _restoreQuestionFn,
  hardDeleteQuestionFn as _hardDeleteQuestionFn,
  flagQuestionFn as _flagQuestionFn,
  resolveQuestionFn as _resolveQuestionFn,
  toggleCheckedStatusFn as _toggleCheckedStatusFn,
} from "../lib/moderation.server"

const getQuizDataFn = _getQuizDataFn as any
const softDeleteQuestionFn = _softDeleteQuestionFn as any
const restoreQuestionFn = _restoreQuestionFn as any
const hardDeleteQuestionFn = _hardDeleteQuestionFn as any
const flagQuestionFn = _flagQuestionFn as any
const resolveQuestionFn = _resolveQuestionFn as any
const toggleCheckedStatusFn = _toggleCheckedStatusFn as any

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
  flagged_reason: string | null
  flagged_notes: string | null
  flagged_at: string | null
  created_by_model: string | null
  created_on_device: string | null
  updated_by_model: string | null
  updated_on_device: string | null
  updated_at: string | null
  checked_status: string
  reference_snippet: string | null
}

interface HierarchyNode {
  title: string
  url: string
  children: Map<string, HierarchyNode>
  isLeaf: boolean
  articleId?: number
}

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
  const { questions, stats } = Route.useLoaderData() as { questions: Question[]; stats: any }
  const router = useRouter()

  // State Management
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilterUrl, setActiveFilterUrl] = useState<string | null>(null)
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(["https://ilmiyyah.com"])
  )
  const [viewTab, setViewTab] = useState<"active" | "deleted" | "flagged">("active")
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false)
  const [flagReason, setFlagReason] = useState("Pertanyaan tidak jelas/bias")
  const [flagNotes, setFlagNotes] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<{ id: number; type: "soft" | "hard"; isInspector?: boolean } | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)

  // Memoize distinct models from current dataset
  const modelsList = useMemo(() => {
    const list = new Set<string>()
    for (const q of questions) {
      list.add(q.created_by_model || "Gemini 2.5 Flash")
    }
    return Array.from(list)
  }, [questions])


  // Synchronize selectedQuestion with fresh loader data
  useEffect(() => {
    if (selectedQuestion) {
      const fresh = questions.find(q => q.id === selectedQuestion.id)
      if (fresh) {
        setSelectedQuestion(fresh)
      } else {
        setSelectedQuestion(null)
      }
    }
  }, [questions])

  useEffect(() => {
    if (!deleteConfirmId) return
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest(".delete-popover-container") && !target.closest("button")) {
        setDeleteConfirmId(null)
      }
    }
    document.addEventListener("click", handleOutsideClick)
    return () => document.removeEventListener("click", handleOutsideClick)
  }, [deleteConfirmId])

  const closeInspector = () => {
    setSelectedQuestion(null)
    setFlagReason("Pertanyaan tidak jelas/bias")
    setFlagNotes("")
  }

  // Build the Folder Tree from active breadcrumbs dynamically
  const folderTree = useMemo(() => {
    const root: HierarchyNode = {
      title: "Mulai (Root)",
      url: "https://ilmiyyah.com",
      children: new Map(),
      isLeaf: false,
    }

    const targetQuestions = questions.filter(q => {
      if (viewTab === "active") return !q.deleted_at
      if (viewTab === "deleted") return !!q.deleted_at
      return !q.deleted_at && !!q.flagged_reason
    })

    for (const q of targetQuestions) {
      let current = root
      for (let i = 0; i < q.breadcrumbs.length; i++) {
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
      // 0. Soft Delete & Flag Filter
      let matchesTab = false
      if (viewTab === "active") {
        matchesTab = !q.deleted_at
      } else if (viewTab === "deleted") {
        matchesTab = !!q.deleted_at
      } else if (viewTab === "flagged") {
        matchesTab = !q.deleted_at && !!q.flagged_reason
      }
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

      // 3. Model Filter
      const matchesModel =
        !selectedModel ||
        (q.created_by_model || "Gemini 2.5 Flash") === selectedModel

      return matchesSearch && matchesHierarchy && matchesModel
    })
  }, [questions, searchTerm, activeFilterUrl, viewTab, selectedModel])

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // paginatedQuestions memo
  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredQuestions.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredQuestions, currentPage])

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, activeFilterUrl, viewTab, selectedModel])

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

  const currentIndex = useMemo(() => {
    if (!selectedQuestion) return -1
    return filteredQuestions.findIndex((q) => q.id === selectedQuestion.id)
  }, [selectedQuestion, filteredQuestions])

  const hasPrevious = currentIndex > 0
  const hasNext = currentIndex !== -1 && currentIndex < filteredQuestions.length - 1

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
                  ? "border-amber-500/20 bg-amber-500/10 font-semibold text-amber-600"
                  : "border-border bg-card text-card-foreground hover:bg-muted"
              }`}
            >
              <RiDeleteBinLine className="h-4 w-4 text-amber-500" />
              <div>
                <span className="font-semibold">{stats.totalDeletedQuestions || 0}</span>
                <span className="ml-1 text-muted-foreground">Sampah</span>
              </div>
            </button>

            <button
              onClick={() => {
                setViewTab("flagged")
                setActiveFilterUrl(null)
              }}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-1.5 text-xs shadow-xs transition-all ${
                viewTab === "flagged"
                  ? "border-red-500/20 bg-red-500/10 font-semibold text-red-600"
                  : "border-border bg-card text-card-foreground hover:bg-muted"
              }`}
            >
              <RiFlagLine className="h-4 w-4 text-red-500" />
              <div>
                <span className="font-semibold">{stats.totalFlaggedQuestions || 0}</span>
                <span className="ml-1 text-muted-foreground">Ditandai (Flag)</span>
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
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6">
        {/* Big Table Pane */}
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Controls Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1">
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

              {/* Pilih Silsilah / Materi Button */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  onClick={() => setIsFilterModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer shadow-3xs"
                >
                  <RiFolderLine className="h-4 w-4 text-primary shrink-0" />
                  <span>Pilih Silsilah / Materi</span>
                </Button>

                {activeFilterUrl && (
                  <button
                    onClick={() => setActiveFilterUrl(null)}
                    className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground transition-all hover:bg-muted-foreground/15 cursor-pointer font-medium"
                  >
                    Reset Filter
                  </button>
                )}
              </div>

              {/* Filter by Model */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <select
                    value={selectedModel || ""}
                    onChange={(e) => setSelectedModel(e.target.value || null)}
                    className="appearance-none rounded-lg border border-border bg-card py-1.5 pl-8 pr-8 text-xs font-semibold text-foreground hover:bg-muted focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-3xs"
                  >
                    <option value="">Semua Model AI</option>
                    {modelsList.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <RiSparklingLine className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-primary shrink-0 pointer-events-none" />
                  <RiArrowDownSLine className="absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-muted-foreground shrink-0 pointer-events-none" />
                </div>
                {selectedModel && (
                  <button
                    onClick={() => setSelectedModel(null)}
                    className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground transition-all hover:bg-muted-foreground/15 cursor-pointer font-medium"
                  >
                    Reset Model
                  </button>
                )}
              </div>
            </div>

            {/* Active filtering indicator */}
            <div className="flex shrink-0 items-center gap-2 self-start text-xs sm:self-center">
              <span className="text-muted-foreground">Menampilkan:</span>
              <span className="max-w-[150px] truncate rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-semibold text-primary" title={currentCategoryName}>
                {currentCategoryName}
              </span>
              {selectedModel && (
                <span className="max-w-[150px] truncate rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 font-semibold text-primary flex items-center gap-1" title={selectedModel}>
                  <RiSparklingLine className="h-3 w-3 animate-pulse shrink-0" />
                  {selectedModel}
                </span>
              )}
              <span className="text-muted-foreground">
                ({filteredQuestions.length} hasil)
              </span>
            </div>
          </div>
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
                  <AnimatePresence mode="popLayout">
                    {paginatedQuestions.length > 0 ? (
                      paginatedQuestions.map((q) => (
                        <motion.tr
                          key={q.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -30 }}
                          transition={{ duration: 0.2 }}
                          className="group cursor-pointer transition-colors hover:bg-muted/30"
                          onClick={() => setSelectedQuestion(q)}
                        >
                          {/* ID */}
                          <td className="p-4 text-center font-mono text-xs text-muted-foreground">
                            <div className="flex flex-col items-center justify-center gap-1">
                              <span>{q.id}</span>
                              {q.flagged_reason && (
                                <span
                                  className="flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-600 shadow-3xs"
                                  title={`Masalah: ${q.flagged_reason}`}
                                >
                                  <RiFlagFill className="h-2.5 w-2.5 shrink-0" />
                                  FLG
                                </span>
                              )}
                            </div>
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
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <RiFileList3Line className="h-3 w-3 text-emerald-600 shrink-0" />
                                  <span
                                    className="max-w-[160px] truncate"
                                    title={q.article_title}
                                  >
                                    {q.article_title}
                                  </span>
                                </span>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const newStatus = q.checked_status === 'sudah dicek' ? 'buatan AI' : 'sudah dicek'
                                    await toggleCheckedStatusFn({ data: { id: q.id, status: newStatus } })
                                    await router.invalidate()
                                  }}
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold select-none cursor-pointer border transition-all duration-150 shrink-0 ${
                                    q.checked_status === "sudah dicek"
                                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20"
                                      : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 hover:bg-indigo-500/20"
                                  }`}
                                >
                                  {q.checked_status === "sudah dicek" ? "Sudah Dicek" : "Buatan AI"}
                                </button>
                                {q.checked_status === "buatan AI" && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                                    <RiSparklingLine className="h-2.5 w-2.5 animate-pulse shrink-0" />
                                    {q.created_by_model || "Gemini 2.5 Flash"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Breadcrumbs */}
                          <td className="vertical-align-middle hidden max-w-[200px] p-4 md:table-cell">
                            <div className="flex flex-wrap items-center gap-1 overflow-hidden">
                              {[...q.breadcrumbs].reverse().slice(0, 3).map((crumb, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-0.5 text-[10px]"
                                >
                                  {idx > 0 && (
                                    <RiArrowLeftSLine className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />
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
                                    className="max-w-[100px] truncate rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary cursor-pointer"
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
                              <div className="relative delete-popover-container inline-block">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-600 cursor-pointer"
                                  onClick={() => setDeleteConfirmId({ id: q.id, type: "soft" })}
                                  title="Hapus Sementara"
                                >
                                  <RiDeleteBinLine className="h-4 w-4" />
                                </Button>

                                {deleteConfirmId?.id === q.id && deleteConfirmId?.type === "soft" && !deleteConfirmId.isInspector && (
                                  <div className="absolute right-0 bottom-full mb-2 z-50 w-56 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150">
                                    <div className="space-y-2 text-left">
                                      <h4 className="font-semibold text-xs text-foreground">Hapus Sementara?</h4>
                                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Soal akan dipindahkan ke tab Sampah dan dapat dipulihkan kapan saja.
                                      </p>
                                      <div className="flex justify-end gap-1.5 pt-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 text-[10px] px-2 py-0.5"
                                          onClick={() => setDeleteConfirmId(null)}
                                        >
                                          Batal
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="h-6 text-[10px] px-2.5 py-0.5 bg-red-600 hover:bg-red-700 text-white font-medium animate-pulse"
                                          onClick={async () => {
                                            await softDeleteQuestionFn({ data: q.id })
                                            setDeleteConfirmId(null)
                                            await router.invalidate()
                                          }}
                                        >
                                          Hapus
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg text-muted-foreground transition-all hover:bg-emerald-500/10 hover:text-emerald-600 cursor-pointer"
                                  onClick={async () => {
                                    await restoreQuestionFn({ data: q.id })
                                    await router.invalidate()
                                  }}
                                  title="Pulihkan Soal"
                                >
                                  <RiHistoryLine className="h-4 w-4" />
                                </Button>

                                <div className="relative delete-popover-container inline-block">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-lg text-muted-foreground transition-all hover:bg-red-600/15 hover:text-red-700 cursor-pointer"
                                    onClick={() => setDeleteConfirmId({ id: q.id, type: "hard" })}
                                    title="Hapus Permanen"
                                  >
                                    <RiCloseLine className="h-4 w-4" />
                                  </Button>

                                  {deleteConfirmId?.id === q.id && deleteConfirmId?.type === "hard" && !deleteConfirmId.isInspector && (
                                    <div className="absolute right-0 bottom-full mb-2 z-50 w-56 rounded-xl border border-red-500/20 bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150">
                                      <div className="space-y-2 text-left">
                                        <h4 className="font-semibold text-xs text-red-600 flex items-center gap-1">
                                          <RiAlertLine className="h-3.5 w-3.5 animate-bounce" />
                                          Hapus Permanen?
                                        </h4>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                          Tindakan ini tidak bisa dibatalkan. Soal akan dihapus selamanya.
                                        </p>
                                        <div className="flex justify-end gap-1.5 pt-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 text-[10px] px-2 py-0.5"
                                            onClick={() => setDeleteConfirmId(null)}
                                          >
                                            Batal
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="h-6 text-[10px] px-2.5 py-0.5 bg-red-600 hover:bg-red-700 text-white font-medium"
                                            onClick={async () => {
                                              await hardDeleteQuestionFn({ data: q.id })
                                              setDeleteConfirmId(null)
                                              await router.invalidate()
                                            }}
                                          >
                                            Hapus
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
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
                </AnimatePresence>
              </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {filteredQuestions.length > itemsPerPage && (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-border bg-muted/30 px-6 py-4 text-xs select-none">
                <div className="text-muted-foreground text-center sm:text-left">
                  Menampilkan <span className="font-semibold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, filteredQuestions.length)}</span> dari <span className="font-semibold text-foreground">{filteredQuestions.length}</span> soal
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg px-3 py-1 cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <RiArrowLeftSLine className="h-4 w-4 shrink-0" />
                    <span>Sebelumnya</span>
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.ceil(filteredQuestions.length / itemsPerPage) }).map((_, idx) => {
                      const pageNum = idx + 1
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            currentPage === pageNum
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg px-3 py-1 cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, Math.ceil(filteredQuestions.length / itemsPerPage)))}
                    disabled={currentPage === Math.ceil(filteredQuestions.length / itemsPerPage)}
                  >
                    <span>Berikutnya</span>
                    <RiArrowRightSLine className="h-4 w-4 shrink-0" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Centered Popover Modal Detailed Question Inspector */}
      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-xs select-none p-4">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={closeInspector}
          />

          <div className="animate-scaleIn relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 p-5">
              <div className="flex items-center gap-2">
                <RiQuestionLine className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Detail Analisis Soal #{selectedQuestion.id}
                </h3>
              </div>
              <button
                onClick={closeInspector}
                className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted cursor-pointer"
              >
                <RiCloseLine className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedQuestion.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.15 }}
                  className="p-6 space-y-6"
                >
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

              {selectedQuestion.flagged_reason && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-700 dark:text-red-400">
                  <RiFlagFill className="h-4.5 w-4.5 shrink-0 text-red-600 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold text-red-800 dark:text-red-300">Soal ini Ditandai / Bermasalah:</span>
                    <p className="font-medium">Sebab: {selectedQuestion.flagged_reason}</p>
                    {selectedQuestion.flagged_notes && (
                      <p className="mt-1 border-t border-red-500/10 pt-1 text-red-700/80 italic">
                        Saran/Catatan: &ldquo;{selectedQuestion.flagged_notes}&rdquo;
                      </p>
                    )}
                    <p className="mt-1 text-[9px] text-red-500/70">
                      Dilaporkan pada: {selectedQuestion.flagged_at ? new Date(selectedQuestion.flagged_at).toLocaleString("id-ID") : "-"}
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
                  {[...selectedQuestion.breadcrumbs].reverse().map((crumb, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      {idx > 0 && (
                        <RiArrowLeftSLine className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                      )}
                      <span
                        onClick={() => {
                          setActiveFilterUrl(
                            crumb.url === "https://ilmiyyah.com"
                              ? null
                              : crumb.url
                          )
                          closeInspector()
                        }}
                        className="font-medium text-muted-foreground/90 rounded bg-muted/60 px-1.5 py-0.5 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                      >
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

              {/* Verbatim Reference Snippet / Kutipan Verbatim */}
              <div className="space-y-2">
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <RiBookOpenLine className="h-3.5 w-3.5 text-primary" />
                  Kutipan Rujukan Verbatim (Ayat / Hadits / Teks Kajian)
                </span>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs italic leading-relaxed text-foreground/90 relative">
                  <span className="absolute top-2 right-3 font-serif text-3xl text-primary/20 select-none">&ldquo;</span>
                  {selectedQuestion.reference_snippet || "Tidak ada kutipan verbatim rujukan yang tersedia."}
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

              {/* Audit Log & History Panel */}
              <div className="space-y-2">
                <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <RiHistoryLine className="h-3.5 w-3.5" />
                  Audit Log & Riwayat Soal
                </span>
                <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Status Verifikasi:</span>
                    <button
                      onClick={async () => {
                        const newStatus = selectedQuestion.checked_status === 'sudah dicek' ? 'buatan AI' : 'sudah dicek'
                        await toggleCheckedStatusFn({ data: { id: selectedQuestion.id, status: newStatus } })
                        await router.invalidate()
                      }}
                      className={`text-[9px] px-2 py-0.5 rounded font-semibold select-none cursor-pointer border transition-all duration-150 shrink-0 ${
                        selectedQuestion.checked_status === "sudah dicek"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20"
                          : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 hover:bg-indigo-500/20"
                      }`}
                    >
                      {selectedQuestion.checked_status === "sudah dicek" ? "Sudah Dicek" : "Buatan AI"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Pembuat (AI Model):</span>
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <RiSparklingLine className="h-3 w-3 text-primary animate-pulse" />
                      {selectedQuestion.created_by_model || "Gemini 2.5 Flash"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Perangkat Pembuat:</span>
                    <span className="font-semibold text-foreground">
                      {selectedQuestion.created_on_device || "Server-Prod-01"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Pengubah Terakhir:</span>
                    <span className="font-semibold text-foreground">
                      {selectedQuestion.updated_by_model || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                    <span className="text-muted-foreground">Perangkat Pengubah:</span>
                    <span className="font-semibold text-foreground">
                      {selectedQuestion.updated_on_device || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-muted-foreground">Terakhir Diperbarui:</span>
                    <span className="font-semibold text-foreground">
                      {selectedQuestion.updated_at
                        ? new Date(selectedQuestion.updated_at).toLocaleString("id-ID")
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

            {/* Drawer Footer */}
            <div className="flex justify-between items-center border-t border-border bg-muted/30 p-4">
              <div className="flex gap-2">
                {selectedQuestion.deleted_at ? (
                  <>
                    <Button
                      onClick={async () => {
                        const nextQuestion = hasNext
                          ? filteredQuestions[currentIndex + 1]
                          : hasPrevious
                          ? filteredQuestions[currentIndex - 1]
                          : null
                        await restoreQuestionFn({ data: selectedQuestion.id })
                        await router.invalidate()
                        if (nextQuestion) {
                          setSelectedQuestion(nextQuestion)
                        } else {
                          closeInspector()
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-1.5 font-medium rounded-lg cursor-pointer"
                    >
                      Pulihkan Soal
                    </Button>
                    <div className="relative delete-popover-container inline-block">
                      <Button
                        onClick={() => setDeleteConfirmId({ id: selectedQuestion.id, type: "hard", isInspector: true })}
                        className="bg-red-700 hover:bg-red-800 text-white text-xs px-3.5 py-1.5 font-medium rounded-lg cursor-pointer"
                      >
                        Hapus Permanen
                      </Button>

                      {deleteConfirmId?.id === selectedQuestion.id && deleteConfirmId?.type === "hard" && deleteConfirmId.isInspector && (
                        <div className="absolute left-0 bottom-full mb-2 z-50 w-64 rounded-xl border border-red-500/20 bg-popover p-4 text-popover-foreground shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
                          <div className="space-y-2 text-left">
                            <h4 className="font-semibold text-xs text-red-600 flex items-center gap-1.5">
                              <RiAlertLine className="h-4 w-4 animate-bounce text-red-500" />
                              Hapus Soal Permanen?
                            </h4>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              Tindakan ini tidak bisa dibatalkan. Soal ini akan dihapus selamanya dari database.
                            </p>
                            <div className="flex justify-end gap-1.5 pt-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2 py-0.5"
                                onClick={() => setDeleteConfirmId(null)}
                              >
                                Batal
                              </Button>
                              <Button
                                size="sm"
                                className="h-6 text-[10px] px-2.5 py-0.5 bg-red-600 hover:bg-red-700 text-white font-medium"
                                onClick={async () => {
                                  const nextQuestion = hasNext
                                    ? filteredQuestions[currentIndex + 1]
                                    : hasPrevious
                                    ? filteredQuestions[currentIndex - 1]
                                    : null
                                  await hardDeleteQuestionFn({ data: selectedQuestion.id })
                                  setDeleteConfirmId(null)
                                  await router.invalidate()
                                  if (nextQuestion) {
                                    setSelectedQuestion(nextQuestion)
                                  } else {
                                    closeInspector()
                                  }
                                }}
                              >
                                Hapus
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {selectedQuestion.checked_status !== "sudah dicek" && (
                      <Button
                        onClick={async () => {
                          await toggleCheckedStatusFn({ data: { id: selectedQuestion.id, status: 'sudah dicek' } })
                          await router.invalidate()
                        }}
                        className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 text-xs px-3.5 py-1.5 font-medium rounded-lg border border-indigo-500/20 cursor-pointer flex items-center gap-1.5"
                      >
                        <RiCheckLine className="h-3.5 w-3.5" />
                        Verifikasi
                      </Button>
                    )}

                    <div className="relative delete-popover-container inline-block">
                      <Button
                        onClick={() => setDeleteConfirmId({ id: selectedQuestion.id, type: "soft", isInspector: true })}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-600 text-xs px-3.5 py-1.5 font-medium rounded-lg border border-red-500/20 cursor-pointer"
                      >
                        Arsipkan Soal
                      </Button>

                      {deleteConfirmId?.id === selectedQuestion.id && deleteConfirmId?.type === "soft" && deleteConfirmId.isInspector && (
                        <div className="absolute left-0 bottom-full mb-2 z-50 w-64 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
                          <div className="space-y-2 text-left">
                            <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                              <RiAlertLine className="h-4 w-4 text-red-500" />
                              Arsipkan Soal?
                            </h4>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              Soal akan dipindahkan ke tab Sampah dan dapat dipulihkan kapan saja.
                            </p>
                            <div className="flex justify-end gap-1.5 pt-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2 py-0.5"
                                onClick={() => setDeleteConfirmId(null)}
                              >
                                Batal
                              </Button>
                              <Button
                                size="sm"
                                className="h-6 text-[10px] px-2.5 py-0.5 bg-red-600 hover:bg-red-700 text-white font-medium animate-pulse"
                                onClick={async () => {
                                  const nextQuestion = hasNext
                                    ? filteredQuestions[currentIndex + 1]
                                    : hasPrevious
                                    ? filteredQuestions[currentIndex - 1]
                                    : null
                                  await softDeleteQuestionFn({ data: selectedQuestion.id })
                                  setDeleteConfirmId(null)
                                  await router.invalidate()
                                  if (nextQuestion) {
                                    setSelectedQuestion(nextQuestion)
                                  } else {
                                    closeInspector()
                                  }
                                }}
                              >
                                Arsipkan
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedQuestion.flagged_reason ? (
                      <Button
                        onClick={async () => {
                          if (confirm("Selesaikan bendera masalah untuk soal ini? Soal akan ditandai kembali sebagai normal.")) {
                            const nextQuestion = hasNext
                              ? filteredQuestions[currentIndex + 1]
                              : hasPrevious
                              ? filteredQuestions[currentIndex - 1]
                              : null
                            await resolveQuestionFn({ data: selectedQuestion.id })
                            await router.invalidate()
                            if (nextQuestion) {
                              setSelectedQuestion(nextQuestion)
                            } else {
                              closeInspector()
                            }
                          }
                        }}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-xs px-3.5 py-1.5 font-medium rounded-lg border border-emerald-500/20 cursor-pointer"
                      >
                        Selesaikan Masalah
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setIsFlagModalOpen(true)}
                        className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 text-xs px-3.5 py-1.5 font-medium rounded-lg border border-amber-500/20 cursor-pointer"
                      >
                        Tandai Masalah
                      </Button>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={!hasPrevious}
                  onClick={() => setSelectedQuestion(filteredQuestions[currentIndex - 1])}
                  className="bg-muted border border-border hover:bg-muted-foreground/10 text-foreground text-xs px-3.5 py-1.5 font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-3xs"
                >
                  Sebelumnya
                </Button>
                <Button
                  disabled={!hasNext}
                  onClick={() => setSelectedQuestion(filteredQuestions[currentIndex + 1])}
                  className="bg-primary text-primary-foreground hover:bg-primary/95 text-xs px-3.5 py-1.5 font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-3xs"
                >
                  Selanjutnya
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Filter Modal */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-xs select-none">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() => setIsFilterModalOpen(false)}
          />
          <div className="animate-scaleIn relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 p-5">
              <div className="flex items-center gap-2">
                <RiFolderLine className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Pilih Silsilah / Materi Kajian
                </h3>
              </div>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted cursor-pointer"
              >
                <RiCloseLine className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-xs text-muted-foreground">
                Pilih silsilah materi untuk menyaring soal evaluasi di bawah. Klik ikon panah untuk memperluas bab.
              </p>
              
              <div className="rounded-lg border border-border bg-background/50 p-3 max-h-[50vh] overflow-y-auto">
                {Array.from(folderTree.children.values()).map(childNode => (
                  <HierarchyFolderTree
                    key={childNode.url}
                    node={childNode}
                    activeFilter={activeFilterUrl}
                    onSelectNode={(url) => {
                      setActiveFilterUrl(url)
                      setIsFilterModalOpen(false)
                    }}
                    expandedNodes={expandedNodes}
                    toggleExpand={toggleExpand}
                  />
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center border-t border-border bg-muted/30 p-4">
              {activeFilterUrl ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setActiveFilterUrl(null)
                    setIsFilterModalOpen(false)
                  }}
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10 cursor-pointer"
                >
                  Reset Filter
                </Button>
              ) : (
                <div />
              )}
              <Button
                onClick={() => setIsFilterModalOpen(false)}
                className="bg-primary text-primary-foreground hover:bg-primary/95 text-xs px-4 py-1.5 rounded-lg cursor-pointer"
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Tandai Masalah Modal */}
      {isFlagModalOpen && selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-xs select-none">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() => setIsFlagModalOpen(false)}
          />
          <div className="animate-scaleIn relative flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/30 p-5">
              <div className="flex items-center gap-2">
                <RiFlagLine className="h-5 w-5 text-red-600 animate-pulse" />
                <h3 className="text-sm font-semibold text-foreground">
                  Tandai Masalah (Soal #{selectedQuestion.id})
                </h3>
              </div>
              <button
                onClick={() => setIsFlagModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-muted cursor-pointer"
              >
                <RiCloseLine className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="rounded-lg border border-red-500/10 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400 leading-relaxed font-medium">
                Soal: &ldquo;{selectedQuestion.question_text}&rdquo;
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase block">
                  Kategori Masalah
                </label>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {[
                    "Pertanyaan tidak jelas/bias",
                    "Jawaban Salah",
                    "Pilihan Jawaban Salah ada yang juga benar",
                    "Keterangan tidak ada hubungannya",
                    "Keterangan tidak ada di artikel",
                    "Lainnya"
                  ].map((reason) => (
                    <label key={reason} className="flex items-center gap-2 cursor-pointer rounded-lg border border-border bg-card p-2 hover:bg-muted/40 transition-colors">
                      <input
                        type="radio"
                        name="flag_reason_modal"
                        checked={flagReason === reason}
                        onChange={() => setFlagReason(reason)}
                        className="text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className="text-foreground">{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase block">
                  Catatan Perbaikan / Saran Lainnya
                </label>
                <textarea
                  value={flagNotes}
                  onChange={(e) => setFlagNotes(e.target.value)}
                  placeholder="Tuliskan detail perbaikan atau saran Anda di sini..."
                  className="w-full min-h-[80px] rounded-lg border border-border bg-background p-3 text-xs focus:ring-1 focus:ring-primary focus:border-primary outline-none text-foreground"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t border-border bg-muted/30 p-4">
              <Button
                variant="ghost"
                onClick={() => setIsFlagModalOpen(false)}
                className="h-8 text-xs cursor-pointer"
              >
                Batal
              </Button>
              <Button
                onClick={async () => {
                  await flagQuestionFn({
                    data: {
                      id: selectedQuestion.id,
                      reason: flagReason,
                      notes: flagNotes
                    }
                  })
                  setFlagNotes("")
                  await router.invalidate()
                  
                  if (hasNext) {
                    setSelectedQuestion(filteredQuestions[currentIndex + 1])
                  } else {
                    setIsFlagModalOpen(false)
                    closeInspector()
                  }
                }}
                className="h-8 bg-red-600 hover:bg-red-700 text-white text-xs px-4 rounded-lg font-medium cursor-pointer"
              >
                Kirim Laporan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
