import { createServerFn } from "@tanstack/react-start"

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

interface ArticleInfo {
  id: number
  title: string
  url: string
  silsilah: string
  speaker: string
}

interface NextArticle {
  id: number
  title: string
  url: string
}

import Database from "better-sqlite3"

export const getQuizFrontendDataFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)

    try {
      // 1. Fetch active questions joined with article info
      const rawQuestions = db
        .prepare(
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
            q.checked_status,
            q.reference_snippet,
            a.title AS article_title,
            a.url AS article_url,
            a.silsilah AS article_silsilah,
            a.speaker AS article_speaker
          FROM questions q
          JOIN articles a ON q.article_id = a.id
          WHERE q.deleted_at IS NULL
          `
        )
        .all() as any[]

      // 2. Fetch hierarchy and articles
      const hierarchyRows = db
        .prepare("SELECT parent_url, child_url, title, sequence_order FROM hierarchy ORDER BY parent_url, sequence_order")
        .all() as any[]
      const articleRows = db
        .prepare("SELECT id, url, title, silsilah, speaker FROM articles")
        .all() as any[]

      // Normalize URLs
      const childToParentMap = new Map<string, { parent_url: string; title: string; sequence_order: number }>()
      const parentToChildrenMap = new Map<string, { child_url: string; title: string; sequence_order: number }[]>()
      
      for (const row of hierarchyRows) {
        if (row.child_url) {
          const childClean = row.child_url.trim().replace(/\/$/, "")
          const parentClean = row.parent_url.trim().replace(/\/$/, "")
          const payload = { parent_url: parentClean, title: row.title, sequence_order: row.sequence_order || 0 }
          childToParentMap.set(childClean, payload)

          if (!parentToChildrenMap.has(parentClean)) {
            parentToChildrenMap.set(parentClean, [])
          }
          parentToChildrenMap.get(parentClean)!.push({
            child_url: childClean,
            title: row.title,
            sequence_order: row.sequence_order || 0
          })
        }
      }

      // Sort children by sequence_order
      for (const [, children] of parentToChildrenMap.entries()) {
        children.sort((a, b) => a.sequence_order - b.sequence_order)
      }

      const articleUrlToInfoMap = new Map<string, ArticleInfo>()
      for (const row of articleRows) {
        if (row.url) {
          const cleanUrl = row.url.trim().replace(/\/$/, "")
          articleUrlToInfoMap.set(cleanUrl, {
            id: row.id,
            title: row.title,
            url: cleanUrl,
            silsilah: row.silsilah || "",
            speaker: row.speaker || "",
          })
        }
      }

      // Trace breadcrumbs trail
      const getBreadcrumbs = (url: string) => {
        const crumbs: { title: string; url: string }[] = []
        let currentUrl = url.trim().replace(/\/$/, "")
        const visited = new Set<string>()

        while (currentUrl && !visited.has(currentUrl)) {
          visited.add(currentUrl)
          const parentInfo = childToParentMap.get(currentUrl)
          if (!parentInfo) {
            const articleInfo = articleUrlToInfoMap.get(currentUrl)
            const title = articleInfo ? articleInfo.title : currentUrl
            crumbs.unshift({ title, url: currentUrl })
            break
          }
          const articleInfo = articleUrlToInfoMap.get(currentUrl)
          crumbs.unshift({
            title: parentInfo.title || (articleInfo ? articleInfo.title : currentUrl),
            url: currentUrl,
          })
          currentUrl = parentInfo.parent_url
        }

        return crumbs
      }

      // Process questions and add breadcrumbs
      const questions: Question[] = rawQuestions.map((q) => ({
        ...q,
        checked_status: q.checked_status === 'NULL' || !q.checked_status ? 'buatan AI' : q.checked_status,
        reference_snippet: q.reference_snippet === 'NULL' || !q.reference_snippet ? null : q.reference_snippet,
        breadcrumbs: getBreadcrumbs(q.article_url),
      }))

      // Build Next Article mapping
      const nextArticleMap: Record<number, NextArticle> = {}
      for (const article of articleRows) {
        if (!article.url) continue
        const cleanUrl = article.url.trim().replace(/\/$/, "")
        const parentInfo = childToParentMap.get(cleanUrl)
        if (parentInfo) {
          const siblings = parentToChildrenMap.get(parentInfo.parent_url) || []
          const currentIndex = siblings.findIndex(s => s.child_url === cleanUrl)
          
          // Check subsequent siblings
          if (currentIndex !== -1 && currentIndex < siblings.length - 1) {
            for (let i = currentIndex + 1; i < siblings.length; i++) {
              const siblingUrl = siblings[i].child_url
              const nextArticleInfo = articleUrlToInfoMap.get(siblingUrl)
              // Make sure the next sibling is actually a practiceable article in our articles table
              if (nextArticleInfo) {
                nextArticleMap[article.id] = {
                  id: nextArticleInfo.id,
                  title: nextArticleInfo.title,
                  url: siblingUrl
                }
                break
              }
            }
          }
        }
      }

      return {
        questions,
        nextArticleMap,
        articles: articleRows.map((a) => ({
          id: a.id,
          title: a.title,
          url: a.url ? a.url.trim().replace(/\/$/, "") : "",
          speaker: a.speaker || "Ustadz",
          silsilah: a.silsilah || "",
        })),
        stats: {
          totalQuestions: questions.length,
          totalArticles: new Set(questions.map((q) => q.article_id)).size,
        }
      }
    } catch (error: any) {
      console.error("Database query failed on homepage:", error)
      throw new Error("Failed to load database: " + error.message)
    } finally {
      db.close()
    }
  }
)
