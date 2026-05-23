import { createFileRoute } from "@tanstack/react-router"
import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  RiSearchLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiBookOpenLine,
  RiCheckLine,
  RiCloseLine,
  RiInformationLine,
  RiSparklingLine,
  RiArrowRightLine,
  RiTrophyLine,
  RiArrowLeftLine,
  RiBook3Line,
  RiRefreshLine,
  RiFlagLine,
  RiFlagFill,
} from "@remixicon/react"
import { motion, AnimatePresence } from "framer-motion"

import { getQuizFrontendDataFn } from "../lib/quiz"
import { flagQuestionFn as _flagQuestionFn } from "../lib/moderation"

const flagQuestionFn = _flagQuestionFn as any

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
  checked_status: string
  reference_snippet: string | null
  article_title: string
  article_url: string
  article_silsilah: string
  article_speaker: string
  breadcrumbs: { title: string; url: string }[]
}


interface HierarchyNode {
  title: string
  url: string
  children: Map<string, HierarchyNode>
  isLeaf: boolean
  articleId?: number
  verifiedCount: number
  aiCount: number
}


export const Route = createFileRoute("/")({
  loader: async () => {
    return await getQuizFrontendDataFn()
  },
  component: UserQuizApp,
})

// Collapsible Folder Tree component designed for mobile
function UserHierarchyTree({
  node,
  expandedNodes,
  toggleExpand,
  onSelectArticle,
  searchTerm,
}: {
  node: HierarchyNode
  expandedNodes: Set<string>
  toggleExpand: (url: string) => void
  onSelectArticle: (articleId: number) => void
  searchTerm: string
}) {
  const isExpanded = expandedNodes.has(node.url) || searchTerm.trim() !== ""
  const hasChildren = node.children.size > 0
  const isRoot = node.url === "https://ilmiyyah.com"

  // Only show node if it has questions or has children with questions
  if (node.verifiedCount === 0 && node.aiCount === 0 && !isRoot) {
    return null
  }

  return (
    <div className="pl-3.5 select-none font-sans">
      <div
        className={`group flex items-center justify-between gap-2 rounded-xl py-2.5 px-3 transition-all ${
          node.isLeaf
            ? "bg-card border border-border/60 hover:border-primary/30 active:scale-[0.98] cursor-pointer shadow-3xs"
            : "hover:bg-muted/40 cursor-pointer"
        }`}
        onClick={() => {
          if (node.isLeaf && node.articleId) {
            onSelectArticle(node.articleId)
          } else {
            toggleExpand(node.url)
          }
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {hasChildren ? (
            <span className="p-0.5 rounded-md hover:bg-muted-foreground/10 shrink-0">
              {isExpanded ? (
                <RiArrowDownSLine className="h-4.5 w-4.5 text-muted-foreground" />
              ) : (
                <RiArrowRightSLine className="h-4.5 w-4.5 text-muted-foreground" />
              )}
            </span>
          ) : (
            <span className="shrink-0 text-primary">
              <RiBookOpenLine className="h-4.5 w-4.5" />
            </span>
          )}

          {hasChildren ? (
            isExpanded ? (
              <RiFolderOpenLine className="h-4.5 w-4.5 shrink-0 text-primary" />
            ) : (
              <RiFolderLine className="h-4.5 w-4.5 shrink-0 text-muted-foreground/80" />
            )
          ) : null}

          <span
            className={`truncate text-sm leading-relaxed ${
              node.isLeaf ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
            }`}
            title={node.title}
          >
            {node.title}
          </span>
        </div>

        {/* Soal Badges count */}
        <div className="flex items-center gap-1.5 shrink-0">
          {node.verifiedCount > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
              <RiCheckLine className="h-3 w-3" />
              <span>{node.verifiedCount}</span>
            </span>
          )}
          {node.aiCount > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30">
              <RiSparklingLine className="h-3 w-3 text-amber-500" />
              <span>{node.aiCount}</span>
            </span>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="mt-1 ml-2.5 space-y-1.5 border-l border-border/50 pl-2">
          {Array.from(node.children.values()).map((child) => (
            <UserHierarchyTree
              key={child.url}
              node={child}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              onSelectArticle={onSelectArticle}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function UserQuizApp() {
  const { questions, nextArticleMap, articles } = Route.useLoaderData()

  // State Management
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null)
  
  // Quiz Flow States
  const [quizState, setQuizState] = useState<"idle" | "quiz" | "interstitial" | "summary">("idle")
  const [quizPool, setQuizPool] = useState<{ verified: Question[]; ai: Question[] }>({ verified: [], ai: [] })
  const [quizType, setQuizType] = useState<"verified" | "ai">("verified")
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  
  // Selection & Checking
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswerChecked, setIsAnswerChecked] = useState(false)
  
  // Performance Tracking
  const [quizScores, setQuizScores] = useState<{ id: number; question: Question; chosen: string; isCorrect: boolean }[]>([])
  const [completedArticles, setCompletedArticles] = useState<Record<number, { score: number; total: number; date: string }>>({})

  // Flagging State
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false)
  const [flagReason, setFlagReason] = useState("Pertanyaan tidak jelas/bias")
  const [flagNotes, setFlagNotes] = useState("")

  // Expand states for folder tree
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(["https://ilmiyyah.com"])
  )

  // Load progress tracker from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tesdeen_completed_articles")
      if (stored) {
        setCompletedArticles(JSON.parse(stored))
      }
    } catch (e) {
      console.error("Local storage error:", e)
    }
  }, [])

  // Sync complete list to local storage
  const saveArticleProgress = (articleId: number, score: number, total: number) => {
    const updated = {
      ...completedArticles,
      [articleId]: {
        score,
        total,
        date: new Date().toLocaleDateString("id-ID"),
      }
    }
    setCompletedArticles(updated)
    try {
      localStorage.setItem("tesdeen_completed_articles", JSON.stringify(updated))
    } catch (e) {
      console.error(e)
    }
  }

  // Current selected article info
  const selectedArticle = useMemo(() => {
    if (selectedArticleId === null) return null
    return articles.find((a) => a.id === selectedArticleId) || null
  }, [selectedArticleId, articles])

  // Map out parent-child folders client side
  const folderTree = useMemo(() => {
    const root: HierarchyNode = {
      title: "Mulai (Root)",
      url: "https://ilmiyyah.com",
      children: new Map(),
      isLeaf: false,
      verifiedCount: 0,
      aiCount: 0,
    }

    for (const q of questions) {
      let current = root
      const isVerified = q.checked_status === "sudah dicek"

      // Increment counts on root
      if (isVerified) root.verifiedCount++
      else root.aiCount++

      // Starting at 0 since we removed root from backend
      for (let i = 0; i < q.breadcrumbs.length; i++) {
        const crumb = q.breadcrumbs[i]
        const cleanUrl = crumb.url.trim().replace(/\/$/, "")

        if (!current.children.has(cleanUrl)) {
          current.children.set(cleanUrl, {
            title: crumb.title,
            url: cleanUrl,
            children: new Map(),
            isLeaf: i === q.breadcrumbs.length - 1,
            articleId: i === q.breadcrumbs.length - 1 ? q.article_id : undefined,
            verifiedCount: 0,
            aiCount: 0,
          })
        }

        current = current.children.get(cleanUrl)!
        if (isVerified) current.verifiedCount++
        else current.aiCount++
      }
    }
    return root
  }, [questions])

  // Tree Expand/Collapse
  const toggleExpand = (url: string) => {
    const next = new Set(expandedNodes)
    if (next.has(url)) {
      next.delete(url)
    } else {
      next.add(url)
    }
    setExpandedNodes(next)
  }

  // Flatten active articles having questions for quick search
  const searchableArticles = useMemo(() => {
    const map = new Map<number, { article: typeof articles[0]; verifiedCount: number; aiCount: number; breadcrumbs: string }>()
    for (const q of questions) {
      if (!map.has(q.article_id)) {
        const art = articles.find(a => a.id === q.article_id)
        if (art) {
          map.set(q.article_id, {
            article: art,
            verifiedCount: 0,
            aiCount: 0,
            breadcrumbs: q.breadcrumbs.map(b => b.title).join(" → ")
          })
        }
      }
      const entry = map.get(q.article_id)!
      if (q.checked_status === "sudah dicek") entry.verifiedCount++
      else entry.aiCount++
    }
    return Array.from(map.values())
  }, [questions, articles])

  // Filtered direct search results
  const filteredSearchList = useMemo(() => {
    const query = searchTerm.toLowerCase().trim()
    if (!query) return []
    return searchableArticles.filter(
      (item) =>
        item.article.title.toLowerCase().includes(query) ||
        item.breadcrumbs.toLowerCase().includes(query)
    )
  }, [searchTerm, searchableArticles])

  // Next article sibling details
  const nextArticleSibling = useMemo(() => {
    if (selectedArticleId === null) return null
    return nextArticleMap[selectedArticleId] || null
  }, [selectedArticleId, nextArticleMap])

  // Initializing quiz for selected article
  const startQuiz = (articleId: number) => {
    const pool = questions.filter((q) => q.article_id === articleId)
    const verified = pool.filter((q) => q.checked_status === "sudah dicek")
    const ai = pool.filter((q) => q.checked_status === "buatan AI")

    setQuizPool({ verified, ai })
    setSelectedArticleId(articleId)
    setQuizScores([])
    setCurrentQuestionIndex(0)
    setIsAnswerChecked(false)
    setSelectedOption(null)

    if (verified.length > 0) {
      setQuizType("verified")
      setCurrentQuestions(verified)
      setQuizState("quiz")
    } else if (ai.length > 0) {
      // No verified questions. Go to interstitial first to warn the user
      setQuizType("ai")
      setCurrentQuestions(ai)
      setQuizState("interstitial")
    } else {
      alert("MasyaAllah, belum ada soal aktif untuk materi ini.")
    }
  }

  // Handle option select
  const selectOption = (opt: string) => {
    if (isAnswerChecked) return
    setSelectedOption(opt)
  }

  // Handle answer checking
  const checkAnswer = () => {
    if (!selectedOption || isAnswerChecked) return
    setIsAnswerChecked(true)

    const currentQ = currentQuestions[currentQuestionIndex]
    const isCorrect = selectedOption.toLowerCase() === currentQ.correct_option.toLowerCase()
    
    setQuizScores((prev) => [
      ...prev,
      {
        id: currentQ.id,
        question: currentQ,
        chosen: selectedOption,
        isCorrect,
      }
    ])
  }

  // Handle moving to the next step
  const handleNext = () => {
    setIsAnswerChecked(false)
    setSelectedOption(null)

    if (currentQuestionIndex < currentQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1)
    } else {
      // Finished current list
      if (quizType === "verified" && quizPool.ai.length > 0) {
        // We finished verified, and there are AI questions
        setQuizType("ai")
        setCurrentQuestions(quizPool.ai)
        setCurrentQuestionIndex(0)
        setQuizState("interstitial")
      } else {
        // All finished!
        setQuizState("summary")
        // Save stats to localStorage
        const correctCount = quizScores.filter(s => s.isCorrect).length
        const totalCount = quizScores.length
        if (selectedArticleId !== null) {
          saveArticleProgress(selectedArticleId, correctCount, totalCount)
        }
      }
    }
  }

  // Close quiz and go back to home screen
  const exitQuiz = () => {
    setSelectedArticleId(null)
    setQuizState("idle")
    setSelectedOption(null)
    setIsAnswerChecked(false)
    setQuizScores([])
  }

  // Handle Flag Submit
  const submitFlag = async () => {
    if (currentQuestions.length > 0) {
      const currentQ = currentQuestions[currentQuestionIndex]
      await flagQuestionFn({ data: { id: currentQ.id, reason: flagReason, notes: flagNotes } })
      setIsFlagModalOpen(false)
      setFlagReason("Pertanyaan tidak jelas/bias")
      setFlagNotes("")
      alert("Jazakallahu khairan atas masukannya. Laporan masalah telah dikirim.")
    }
  }

  // Solved Stats calculation
  const totalArticlesSolved = useMemo(() => {
    return Object.keys(completedArticles).length
  }, [completedArticles])

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased flex flex-col items-center">
      {/* Outer container responsive for both Mobile and Web */}
      <div className="w-full max-w-2xl lg:max-w-3xl min-h-screen bg-card flex flex-col shadow-lg border-x border-border/30 relative transition-all duration-300">
        <AnimatePresence mode="wait">
          
          {/* 1. IDLE STATE: Beranda & Pemilihan Materi */}
          {quizState === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex-1 flex flex-col p-5 pb-8"
            >
              {/* Header Profile / Greeting */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-lg">
                    LD
                  </div>
                  <div>
                    <h1 className="text-base font-bold leading-tight tracking-tight text-foreground">
                      Bismillah. LatihanDulu
                    </h1>
                    <p className="text-xs text-muted-foreground">
                      Uji pemahaman syar'i antum
                    </p>
                  </div>
                </div>
                
                {/* Stats badge */}
                <div className="flex items-center gap-1 bg-muted px-2.5 py-1.5 rounded-full border border-border/80">
                  <RiTrophyLine className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-bold text-foreground">
                    {totalArticlesSolved} Selesai
                  </span>
                </div>
              </div>

              {/* Quick Hero Welcome message */}
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4.5 border border-primary/15 mb-6 text-sm">
                <p className="font-semibold text-primary mb-1 flex items-center gap-1.5">
                  <RiVolumeUpLine className="h-4 w-4 shrink-0 text-primary" />
                  Selamat datang di LatihanDulu!
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Pilih materi kajian yang ingin antum kuasai di bawah. Latih ingatan antum dengan soal-soal terverifikasi terlebih dahulu, lalu lanjutkan dengan penguatan dari soal buatan AI.
                </p>
              </div>

              {/* Large Sticky Search Bar */}
              <div className="relative mb-6">
                <RiSearchLine className="absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Cari judul artikel atau silsilah kajian..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-border/70 bg-background py-3 pr-10 pl-10 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground shadow-3xs"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-all hover:bg-muted"
                  >
                    <RiCloseLine className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Fast Search Results when searching */}
              {searchTerm.trim() !== "" ? (
                <div className="flex-1 flex flex-col gap-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1">
                    Hasil Pencarian ({filteredSearchList.length})
                  </h2>
                  <div className="space-y-3.5">
                    {filteredSearchList.length > 0 ? (
                      filteredSearchList.map(({ article, verifiedCount, aiCount, breadcrumbs }) => {
                        const solved = completedArticles[article.id]
                        return (
                          <motion.div
                            key={article.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-card border border-border/80 hover:border-primary/40 rounded-xl p-4 cursor-pointer active:scale-[0.99] transition-all shadow-3xs flex flex-col gap-2 relative overflow-hidden"
                            onClick={() => startQuiz(article.id)}
                          >
                            {/* Solved checkmark */}
                            {solved && (
                              <div className="absolute top-0 right-0 bg-emerald-500 text-white rounded-bl-xl px-2 py-0.5 text-[9px] font-bold flex items-center gap-0.5">
                                <RiCheckLine className="h-3 w-3" /> Solved ({solved.score}/{solved.total})
                              </div>
                            )}

                            <div className="text-[10px] text-primary font-medium tracking-wide uppercase truncate max-w-[280px]">
                              {breadcrumbs}
                            </div>
                            <h3 className="text-sm font-bold text-foreground leading-snug">
                              {article.title}
                            </h3>
                            <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-border/30">
                              <span className="text-[11px] text-muted-foreground truncate">
                                {article.speaker}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {verifiedCount > 0 && (
                                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100/50">
                                    ✓ {verifiedCount}
                                  </span>
                                )}
                                {aiCount > 0 && (
                                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-100/50">
                                    🤖 {aiCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })
                    ) : (
                      <div className="text-center py-12 text-sm text-muted-foreground">
                        <RiInformationLine className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                        Afwan, materi yang antum cari tidak ditemukan.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Collapsible Folder Hierarchy tree */
                <div className="flex-1 flex flex-col">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 mb-3">
                    Daftar Silsilah Kajian
                  </h2>
                  <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[60vh] custom-scrollbar">
                    {Array.from(folderTree.children.values()).map(childNode => (
                      <UserHierarchyTree
                        key={childNode.url}
                        node={childNode}
                        expandedNodes={expandedNodes}
                        toggleExpand={toggleExpand}
                        onSelectArticle={startQuiz}
                        searchTerm={searchTerm}
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* 2. QUIZ STATE: Tampilan Pengerjaan Soal */}
          {quizState === "quiz" && currentQuestions.length > 0 && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col p-5"
            >
              {/* Quiz Header Info */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={exitQuiz}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer active:scale-95 transition-all"
                >
                  <RiArrowLeftLine className="h-4 w-4" /> Keluar
                </button>

                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    quizType === "verified"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : "bg-amber-100 text-amber-800 border border-amber-200"
                  }`}>
                    {quizType === "verified" ? "Terverifikasi ✓" : "Soal AI 🤖"}
                  </span>

                  <button 
                    onClick={() => setIsFlagModalOpen(true)}
                    className="flex items-center justify-center p-1.5 rounded-md border border-border/80 bg-muted/40 hover:bg-red-500/10 hover:text-red-600 hover:border-red-500/30 transition-all text-muted-foreground"
                    title="Laporkan Masalah Soal"
                  >
                    <RiFlagLine className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5 font-bold">
                  <span>Soal {currentQuestionIndex + 1} dari {currentQuestions.length}</span>
                  <span>{Math.round(((currentQuestionIndex) / currentQuestions.length) * 100)}%</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${((currentQuestionIndex + 1) / currentQuestions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Question Text block */}
              <div className="bg-card border border-border/80 rounded-2xl p-5 mb-5 shadow-3xs">
                <p className="text-[10px] text-primary/80 uppercase font-bold tracking-wider mb-2">
                  {selectedArticle?.title}
                </p>
                <h3 className="text-base font-extrabold text-foreground leading-relaxed">
                  {currentQuestions[currentQuestionIndex].question_text}
                </h3>
              </div>

              {/* Options list A, B, C, D */}
              <div className="space-y-3 flex-1 flex flex-col justify-start">
                {["a", "b", "c", "d"].map((optKey) => {
                  const optionLabel = optKey.toUpperCase()
                  const optionText = currentQuestions[currentQuestionIndex][`option_${optKey}` as keyof Question] as string
                  const isSelected = selectedOption === optKey
                  const isCorrectAnswer = optKey.toLowerCase() === currentQuestions[currentQuestionIndex].correct_option.toLowerCase()
                  
                  let optionStyle = "border-border/80 hover:border-primary/40 hover:bg-muted/10 bg-card text-foreground"
                  
                  if (isSelected && !isAnswerChecked) {
                    optionStyle = "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                  } else if (isAnswerChecked) {
                    if (isCorrectAnswer) {
                      optionStyle = "border-emerald-500 bg-emerald-50 text-emerald-950 font-bold dark:bg-emerald-950/20 dark:text-emerald-300 ring-1 ring-emerald-500"
                    } else if (isSelected) {
                      optionStyle = "border-destructive bg-destructive/5 text-destructive font-bold ring-1 ring-destructive"
                    } else {
                      optionStyle = "border-border/30 opacity-60 bg-muted/20"
                    }
                  }

                  return (
                    <button
                      key={optKey}
                      onClick={() => selectOption(optKey)}
                      disabled={isAnswerChecked}
                      className={`w-full flex items-center justify-between gap-3 text-left rounded-xl p-3.5 border transition-all text-sm cursor-pointer ${optionStyle}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-6.5 w-6.5 text-xs font-bold rounded-full flex items-center justify-center shrink-0 border transition-all ${
                          isSelected && !isAnswerChecked
                            ? "bg-primary border-primary text-white"
                            : isAnswerChecked && isCorrectAnswer
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : isAnswerChecked && isSelected
                            ? "bg-destructive border-destructive text-white"
                            : "bg-muted border-border/80 text-muted-foreground group-hover:bg-muted-foreground/10"
                        }`}>
                          {optionLabel}
                        </span>
                        <span className="leading-relaxed">{optionText}</span>
                      </div>

                      {isAnswerChecked && (
                        <div className="shrink-0">
                          {isCorrectAnswer ? (
                            <span className="h-5 w-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[10px]">✓</span>
                          ) : isSelected ? (
                            <span className="h-5 w-5 bg-destructive text-white rounded-full flex items-center justify-center text-[10px]">✕</span>
                          ) : null}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Submit / Check Drawer Panel */}
              <div className="mt-6">
                <AnimatePresence>
                  {isAnswerChecked && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border border-border/60 bg-muted/30 rounded-2xl p-4.5 mb-4 shadow-3xs overflow-hidden"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
                          <RiInformationLine className="h-4.5 w-4.5" />
                        </div>
                        <div className="text-xs space-y-2">
                          <div>
                            <h4 className="font-bold text-foreground">Pembahasan</h4>
                            <p className="text-muted-foreground mt-0.5 leading-relaxed">
                              {currentQuestions[currentQuestionIndex].explanation}
                            </p>
                          </div>
                          
                          {/* Reference Snippet */}
                          {currentQuestions[currentQuestionIndex].reference_snippet && (
                            <div className="pt-2 border-t border-border/40">
                              <h5 className="font-bold text-primary flex items-center gap-1 mb-1">
                                <RiBook3Line className="h-3.5 w-3.5" /> Kutipan Transkrip
                              </h5>
                              <blockquote className="bg-background border-l-2 border-primary/50 pl-2.5 py-1 text-muted-foreground italic leading-relaxed text-[11px]">
                                "{currentQuestions[currentQuestionIndex].reference_snippet}"
                              </blockquote>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Primary Action Button */}
                {!isAnswerChecked ? (
                  <Button
                    onClick={checkAnswer}
                    disabled={!selectedOption}
                    className="w-full py-6 text-sm font-bold bg-primary hover:bg-primary/95 text-white rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98]"
                  >
                    Periksa Jawaban
                  </Button>
                ) : (
                  <Button
                    onClick={handleNext}
                    className="w-full py-6 text-sm font-bold bg-foreground hover:bg-foreground/90 text-background rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                  >
                    <span>Lanjut</span>
                    <RiArrowRightLine className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {/* 3. INTERSTITIAL STATE: Konfirmasi Lanjut ke Soal buatan AI */}
          {quizState === "interstitial" && (
            <motion.div
              key="interstitial"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex-1 flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="h-16 w-16 bg-amber-50 dark:bg-amber-950/20 text-amber-500 rounded-full border border-amber-100 dark:border-amber-900/30 flex items-center justify-center mb-6 shadow-sm">
                <RiSparklingLine className="h-8 w-8 animate-pulse text-amber-500" />
              </div>

              {quizPool.verified.length > 0 ? (
                <>
                  <h2 className="text-xl font-bold text-foreground mb-2 leading-tight">
                    Materi Terverifikasi Selesai!
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-[280px]">
                    Alhamdulillah, antum telah menyelesaikan <strong>{quizPool.verified.length} soal terverifikasi</strong>. Ingin menguji lebih dalam dengan <strong>{quizPool.ai.length} soal buatan AI</strong>?
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-foreground mb-2 leading-tight">
                    Latihan Soal AI
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-[280px]">
                    Afwan, materi ini <strong>belum memiliki soal terverifikasi</strong>. Apakah antum ingin berlatih menggunakan <strong>{quizPool.ai.length} soal buatan AI</strong>?
                  </p>
                </>
              )}

              <div className="w-full space-y-3 max-w-[260px]">
                <Button
                  onClick={() => {
                    setQuizType("ai")
                    setCurrentQuestions(quizPool.ai)
                    setCurrentQuestionIndex(0)
                    setQuizState("quiz")
                  }}
                  className="w-full py-5 text-xs font-bold bg-primary hover:bg-primary/95 text-white rounded-xl shadow-sm cursor-pointer transition-all active:scale-[0.98]"
                >
                  Mulai Latihan Soal AI
                </Button>
                
                <Button
                  onClick={() => {
                    if (quizPool.verified.length > 0) {
                      // Skip directly to summary
                      setQuizState("summary")
                      const correctCount = quizScores.filter(s => s.isCorrect).length
                      const totalCount = quizScores.length
                      if (selectedArticleId !== null) {
                        saveArticleProgress(selectedArticleId, correctCount, totalCount)
                      }
                    } else {
                      exitQuiz()
                    }
                  }}
                  className="w-full py-5 text-xs font-bold bg-card border border-border hover:bg-muted text-foreground rounded-xl cursor-pointer transition-all active:scale-[0.98]"
                >
                  {quizPool.verified.length > 0 ? "Lihat Ringkasan" : "Kembali ke Menu"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* 4. SUMMARY STATE: Halaman Ringkasan & Continuity Silsilah */}
          {quizState === "summary" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex-1 flex flex-col p-5 pb-8"
            >
              <h2 className="text-lg font-bold text-center text-foreground mb-5">
                Alhamdulillah! Selesai
              </h2>

              {/* Score visual widget */}
              <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-5 text-center mb-6 shadow-3xs flex flex-col items-center">
                <div className="h-20 w-20 bg-primary/10 rounded-full border border-primary/20 flex items-center justify-center text-primary mb-3">
                  <RiTrophyLine className="h-10 w-10 text-primary" />
                </div>
                
                <h3 className="text-2xl font-black text-foreground tracking-tight">
                  Skor: {Math.round((quizScores.filter(s => s.isCorrect).length / quizScores.length) * 100)}%
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Antum menjawab benar <strong className="text-foreground">{quizScores.filter(s => s.isCorrect).length}</strong> dari <strong className="text-foreground">{quizScores.length}</strong> pertanyaan.
                </p>

                {/* Islamic appreciation quote based on performance */}
                <div className="mt-4 text-xs italic text-primary leading-relaxed max-w-[280px]">
                  {(() => {
                    const pct = (quizScores.filter(s => s.isCorrect).length / quizScores.length) * 100
                    if (pct === 100) return "MasyaAllah! Sempurna! Semoga Allah memberkahi ilmu antum."
                    if (pct >= 70) return "Alhamdulillah! Hasil yang sangat baik. Barakallahu fiik."
                    return "Alhamdulillah! Tetap semangat berlatih. Ingatlah sabda Nabi: 'Semangatlah atas hal-hal yang bermanfaat bagimu'."
                  })()}
                </div>
              </div>

              {/* Review Section */}
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 mb-3">
                  Tinjauan Jawaban
                </h3>
                <div className="space-y-2.5 max-h-[30vh] overflow-y-auto pr-1 custom-scrollbar">
                  {quizScores.map((scoreItem, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-muted/40 rounded-xl border border-border/50 text-xs flex gap-2.5 items-start"
                    >
                      <span className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-[10px] text-white ${
                        scoreItem.isCorrect ? "bg-emerald-500" : "bg-destructive"
                      }`}>
                        {scoreItem.isCorrect ? "✓" : "✕"}
                      </span>
                      <div className="space-y-1">
                        <p className="font-bold text-foreground leading-relaxed">
                          {scoreItem.question.question_text}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          Jawaban antum: <strong className={scoreItem.isCorrect ? "text-emerald-600" : "text-destructive"}>
                            {scoreItem.chosen.toUpperCase()}. {scoreItem.question[`option_${scoreItem.chosen.toLowerCase()}` as keyof Question] as string}
                          </strong>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Continuity / Next Article Section */}
              <div className="space-y-4 mt-auto">
                {nextArticleSibling ? (
                  <div className="bg-card border-2 border-primary/20 rounded-2xl p-4.5 shadow-3xs">
                    <p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <RiBookOpenLine className="h-3.5 w-3.5" /> Lanjut ke Materi Silsilah Berikutnya
                    </p>
                    <h4 className="text-sm font-bold text-foreground leading-snug mb-3">
                      {nextArticleSibling.title}
                    </h4>
                    <Button
                      onClick={() => startQuiz(nextArticleSibling.id)}
                      className="w-full py-5 text-xs font-bold bg-primary hover:bg-primary/95 text-white rounded-xl shadow-sm cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-1"
                    >
                      <span>Mulai Materi Selanjutnya</span>
                      <RiArrowRightLine className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="bg-muted/30 border border-border/80 rounded-2xl p-4.5 text-center text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Alhamdulillah!</p>
                    Antum telah menyelesaikan materi terakhir dalam cabang silsilah kajian ini.
                  </div>
                )}

                <Button
                  onClick={exitQuiz}
                  className="w-full py-5 text-xs font-bold bg-card border border-border hover:bg-muted text-foreground rounded-xl cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-1"
                >
                  <RiRefreshLine className="h-4 w-4" />
                  <span>Kembali ke Menu Utama</span>
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Flag Question Modal */}
      {isFlagModalOpen && currentQuestions.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-xs px-4">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() => setIsFlagModalOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <RiFlagLine className="h-4.5 w-4.5 text-red-600" />
                <h3 className="text-sm font-bold text-foreground">
                  Laporkan Masalah
                </h3>
              </div>
              <button
                onClick={() => setIsFlagModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <RiCloseLine className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ada kendala dengan soal ini? Pilih jenis masalah di bawah untuk membantu kami meningkatkan kualitas materi.
              </p>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Kategori Kendala
                </label>
                <select
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                >
                  <option value="Pertanyaan tidak jelas/bias">Pertanyaan tidak jelas/bias</option>
                  <option value="Jawaban Salah">Jawaban Salah</option>
                  <option value="Pilihan Jawaban Salah ada yang juga benar">Pilihan Jawaban Salah ada yang juga benar</option>
                  <option value="Keterangan tidak ada hubungannya">Keterangan tidak ada hubungannya</option>
                  <option value="Keterangan tidak ada di artikel">Keterangan tidak ada di artikel</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  value={flagNotes}
                  onChange={(e) => setFlagNotes(e.target.value)}
                  placeholder="Beri tahu kami detail kesalahannya..."
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none min-h-[80px] resize-none"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 p-4">
              <Button
                variant="ghost"
                onClick={() => setIsFlagModalOpen(false)}
                className="text-xs px-4 cursor-pointer"
              >
                Batal
              </Button>
              <Button
                onClick={submitFlag}
                className="text-xs px-4 bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
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

// Custom simple helper component for icon layout
function RiVolumeUpLine({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    </svg>
  )
}
