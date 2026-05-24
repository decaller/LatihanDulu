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

import Database from "better-sqlite3"

export const getQuizDataFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)

    try {
      // 1. Fetch questions joined with article info
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
        q.deleted_at,
        q.flagged_reason,
        q.flagged_notes,
        q.flagged_at,
        q.created_by_model,
        q.created_on_device,
        q.updated_by_model,
        q.updated_on_device,
        q.updated_at,
        q.checked_status,
        q.reference_snippet,
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
        .prepare("SELECT parent_url, child_url, title FROM hierarchy")
        .all() as any[]
      const articleRows = db
        .prepare("SELECT id, url, title FROM articles")
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

        return crumbs
      }

      const questions: Question[] = rawQuestions.map((q) => ({
        ...q,
        deleted_at: q.deleted_at === 'NULL' || !q.deleted_at ? null : q.deleted_at,
        flagged_reason: q.flagged_reason === 'NULL' || !q.flagged_reason ? null : q.flagged_reason,
        flagged_notes: q.flagged_notes === 'NULL' || !q.flagged_notes ? null : q.flagged_notes,
        flagged_at: q.flagged_at === 'NULL' || !q.flagged_at ? null : q.flagged_at,
        created_by_model: q.created_by_model === 'NULL' || !q.created_by_model ? 'Gemini 2.5 Flash' : q.created_by_model,
        created_on_device: q.created_on_device === 'NULL' || !q.created_on_device ? 'Server-Prod-01' : q.created_on_device,
        updated_by_model: q.updated_by_model === 'NULL' || !q.updated_by_model ? null : q.updated_by_model,
        updated_on_device: q.updated_on_device === 'NULL' || !q.updated_on_device ? null : q.updated_on_device,
        updated_at: q.updated_at === 'NULL' || !q.updated_at ? null : q.updated_at,
        checked_status: q.checked_status === 'NULL' || !q.checked_status ? 'buatan AI' : q.checked_status,
        reference_snippet: q.reference_snippet === 'NULL' || !q.reference_snippet ? null : q.reference_snippet,
        breadcrumbs: getBreadcrumbs(q.article_url),
      }))

      const activeQuestions = questions.filter(q => !q.deleted_at)
      const deletedQuestions = questions.filter(q => q.deleted_at)

      return {
        questions,
        stats: {
          totalQuestions: activeQuestions.length,
          totalDeletedQuestions: deletedQuestions.length,
          totalFlaggedQuestions: activeQuestions.filter(q => q.flagged_reason).length,
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

export const softDeleteQuestionFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const id = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)
    try {
      db.prepare(`
        UPDATE questions 
        SET deleted_at = CURRENT_TIMESTAMP,
            updated_by_model = 'User Moderator (Soft Deleted)',
            updated_on_device = 'Local Computer',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id)
      return { success: true }
    } catch (error: any) {
      console.error("Soft delete failed:", error)
      throw new Error("Failed to soft delete question: " + error.message)
    } finally {
      db.close()
    }
  })

export const restoreQuestionFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const id = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)
    try {
      db.prepare(`
        UPDATE questions 
        SET deleted_at = NULL,
            updated_by_model = 'User Moderator (Restored)',
            updated_on_device = 'Local Computer',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id)
      return { success: true }
    } catch (error: any) {
      console.error("Restore failed:", error)
      throw new Error("Failed to restore question: " + error.message)
    } finally {
      db.close()
    }
  })

export const hardDeleteQuestionFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const id = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)
    try {
      db.prepare("DELETE FROM questions WHERE id = ?").run(id)
      return { success: true }
    } catch (error: any) {
      console.error("Hard delete failed:", error)
      throw new Error("Failed to permanently delete question: " + error.message)
    } finally {
      db.close()
    }
  })

export const flagQuestionFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const { id, reason, notes } = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)
    try {
      db.prepare(`
        UPDATE questions 
        SET flagged_reason = ?, 
            flagged_notes = ?, 
            flagged_at = CURRENT_TIMESTAMP,
            updated_by_model = 'User Moderator',
            updated_on_device = 'Local Computer',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reason, notes, id)
      return { success: true }
    } catch (error: any) {
      console.error("Flag question failed:", error)
      throw new Error("Failed to flag question: " + error.message)
    } finally {
      db.close()
    }
  })

export const resolveQuestionFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const id = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)
    try {
      db.prepare(`
        UPDATE questions 
        SET flagged_reason = NULL, 
            flagged_notes = NULL, 
            flagged_at = NULL,
            updated_by_model = 'User Moderator (Resolved)',
            updated_on_device = 'Local Computer',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id)
      return { success: true }
    } catch (error: any) {
      console.error("Resolve flag failed:", error)
      throw new Error("Failed to resolve flag: " + error.message)
    } finally {
      db.close()
    }
  })

export const toggleCheckedStatusFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const { id, status } = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)
    try {
      db.prepare(`
        UPDATE questions 
        SET checked_status = ?,
            updated_by_model = 'User Moderator',
            updated_on_device = 'Local Computer',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, id)
      return { success: true }
    } catch (error: any) {
      console.error("Toggle checked status failed:", error)
      throw new Error("Failed to update checked status: " + error.message)
    } finally {
      db.close()
    }
  })

export const getHierarchyTreeDataFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)

    try {
      // 1. Fetch hierarchy mapping
      const hierarchyRows = db
        .prepare("SELECT id, parent_url, child_url, title, sequence_order FROM hierarchy ORDER BY sequence_order ASC, id ASC")
        .all() as any[]

      // 2. Fetch all articles
      const articleRows = db
        .prepare("SELECT id, url, title, speaker FROM articles")
        .all() as any[]

      // Create maps
      const articleMap = new Map<string, any>()
      for (const art of articleRows) {
        if (art.url) {
          articleMap.set(art.url.trim().replace(/\/$/, ""), art)
        }
      }

      // Group children by parentUrl
      const parentToChildren = new Map<string, any[]>()
      for (const row of hierarchyRows) {
        const parentUrl = row.parent_url ? row.parent_url.trim().replace(/\/$/, "") : ""
        if (!parentToChildren.has(parentUrl)) {
          parentToChildren.set(parentUrl, [])
        }
        parentToChildren.get(parentUrl)!.push(row)
      }

      // Recursive builder starting from root
      const buildTree = (url: string): any[] => {
        const childrenRows = parentToChildren.get(url) || []
        const childrenNodes: any[] = []

        for (const row of childrenRows) {
          const childUrl = row.child_url ? row.child_url.trim().replace(/\/$/, "") : ""
          const isArticle = articleMap.has(childUrl)
          const articleInfo = articleMap.get(childUrl)

          const node: any = {
            id: childUrl,
            isGroup: !isArticle,
            data: {
              id: row.id,
              title: row.title || (isArticle ? articleInfo.title : childUrl),
              url: childUrl,
              parentUrl: url,
              isArticle,
              articleId: isArticle ? articleInfo.id : undefined,
              speaker: isArticle ? articleInfo.speaker : undefined,
              sequenceOrder: row.sequence_order || 0,
            }
          }

          if (!isArticle) {
            // Recursively build children
            node.children = buildTree(childUrl)
          }

          childrenNodes.push(node)
        }

        return childrenNodes
      }

      // Root is usually https://ilmiyyah.com
      const rootUrl = "https://ilmiyyah.com"
      const tree = buildTree(rootUrl)

      // 3. Find unmapped articles
      const mappedUrls = new Set(hierarchyRows.map(r => r.child_url ? r.child_url.trim().replace(/\/$/, "") : ""))
      const unmappedArticles = articleRows
        .filter(art => art.url && !mappedUrls.has(art.url.trim().replace(/\/$/, "")))
        .map(art => ({
          id: art.url.trim().replace(/\/$/, ""),
          isGroup: false,
          data: {
            title: art.title,
            url: art.url.trim().replace(/\/$/, ""),
            isArticle: true,
            articleId: art.id,
            speaker: art.speaker,
            parentUrl: null,
            sequenceOrder: 0,
          }
        }))

      return {
        tree,
        unmappedArticles,
        stats: {
          totalHierarchyItems: hierarchyRows.length,
          totalArticles: articleRows.length,
          unmappedCount: unmappedArticles.length,
        }
      }
    } catch (error: any) {
      console.error("Failed to load hierarchy tree data:", error)
      throw new Error("Failed to load hierarchy tree: " + error.message)
    } finally {
      db.close()
    }
  }
)

export const moveHierarchyNodeFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const { childUrl, newParentUrl, siblings } = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)

    try {
      db.transaction(() => {
        // 1. Check if the mapping already exists in hierarchy.
        // If not (e.g. dragging from Unmapped Articles), we must INSERT it!
        const existing = db.prepare("SELECT id FROM hierarchy WHERE child_url = ?").get(childUrl) as any

        // Find the title for the new record
        let nodeTitle = "Baru"
        if (!existing) {
          // If it was an article, find its title from articles table
          const article = db.prepare("SELECT title FROM articles WHERE url = ?").get(childUrl) as any
          if (article) {
            nodeTitle = article.title
          } else {
            // Extract a title from the URL slug
            const parts = childUrl.split("/")
            nodeTitle = parts[parts.length - 1] || "Materi Baru"
          }

          db.prepare("INSERT INTO hierarchy (parent_url, child_url, title, sequence_order) VALUES (?, ?, ?, 0)")
            .run(newParentUrl, childUrl, nodeTitle)
        } else {
          db.prepare("UPDATE hierarchy SET parent_url = ? WHERE child_url = ?")
            .run(newParentUrl, childUrl)
        }

        // 2. Re-sequence all siblings under the new parent to ensure stability
        if (siblings && Array.isArray(siblings)) {
          const updateStmt = db.prepare("UPDATE hierarchy SET sequence_order = ? WHERE child_url = ?")
          for (let i = 0; i < siblings.length; i++) {
            updateStmt.run(i, siblings[i])
          }
        }
      })()

      return { success: true }
    } catch (error: any) {
      console.error("Failed to move hierarchy node:", error)
      throw new Error("Failed to move hierarchy node: " + error.message)
    } finally {
      db.close()
    }
  })

export const createHierarchyFolderFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const { parentUrl, title } = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)

    try {
      // Sluggify title to make unique childUrl
      const cleanTitle = title.trim().toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")

      const uniqueSuffix = Math.floor(1000 + Math.random() * 9000)
      const childUrl = `${parentUrl.replace(/\/$/, "")}/${cleanTitle}-${uniqueSuffix}`

      // Get highest sequence_order under parent
      const maxSeqRow = db.prepare("SELECT MAX(sequence_order) as max_seq FROM hierarchy WHERE parent_url = ?").get(parentUrl) as any
      const nextSeq = (maxSeqRow?.max_seq !== null ? maxSeqRow.max_seq : -1) + 1

      db.prepare("INSERT INTO hierarchy (parent_url, child_url, title, sequence_order) VALUES (?, ?, ?, ?)")
        .run(parentUrl, childUrl, title, nextSeq)

      return { success: true, folderUrl: childUrl }
    } catch (error: any) {
      console.error("Failed to create folder:", error)
      throw new Error("Failed to create folder: " + error.message)
    } finally {
      db.close()
    }
  })

export const renameHierarchyNodeFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const { childUrl, newTitle } = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)

    try {
      db.prepare("UPDATE hierarchy SET title = ? WHERE child_url = ?").run(newTitle, childUrl)
      return { success: true }
    } catch (error: any) {
      console.error("Failed to rename node:", error)
      throw new Error("Failed to rename node: " + error.message)
    } finally {
      db.close()
    }
  })

export const deleteHierarchyNodeFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const { childUrl } = ctx.data
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)

    try {
      db.transaction(() => {
        // Find if this node has child relations under it (i.e. is a parent to others)
        const hasChildren = db.prepare("SELECT count(*) as count FROM hierarchy WHERE parent_url = ?").get(childUrl) as any
        if (hasChildren && hasChildren.count > 0) {
          // Orphan the children by moving them up to the deleted node's parent!
          const parentRow = db.prepare("SELECT parent_url FROM hierarchy WHERE child_url = ?").get(childUrl) as any
          const parentUrl = parentRow ? parentRow.parent_url : "https://ilmiyyah.com"

          db.prepare("UPDATE hierarchy SET parent_url = ? WHERE parent_url = ?").run(parentUrl, childUrl)
        }

      db.prepare("DELETE FROM hierarchy WHERE child_url = ?").run(childUrl)
      })()

      return { success: true }
    } catch (error: any) {
      console.error("Failed to delete node:", error)
      throw new Error("Failed to delete node: " + error.message)
    } finally {
      db.close()
    }
  })

export const saveFullHierarchyFn = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const updates = ctx.data // Array of { childUrl, parentUrl, sequenceOrder }
    const dbPath = process.env.DB_PATH && process.env.DB_PATH.startsWith("/") 
      ? process.env.DB_PATH 
      : `${process.cwd()}/${process.env.DB_PATH || "backend/data.db"}`
    const db = new Database(dbPath)

    try {
      db.transaction(() => {
        const updateStmt = db.prepare(`
          UPDATE hierarchy 
          SET parent_url = ?, sequence_order = ? 
          WHERE child_url = ?
        `)

        for (const item of updates) {
          // Check if child_url exists in hierarchy mapping at all.
          // (e.g. if it was an unmapped article dragged in)
          const exists = db.prepare("SELECT id FROM hierarchy WHERE child_url = ?").get(item.childUrl) as any
          if (!exists) {
            // Find article title
            const article = db.prepare("SELECT title FROM articles WHERE url = ?").get(item.childUrl) as any
            const title = article ? article.title : (item.childUrl.split("/").pop() || "Baru")
            db.prepare("INSERT INTO hierarchy (parent_url, child_url, title, sequence_order) VALUES (?, ?, ?, ?)")
              .run(item.parentUrl, item.childUrl, title, item.sequenceOrder)
          } else {
            // Normal update parent and order
            updateStmt.run(item.parentUrl, item.sequenceOrder, item.childUrl)
          }
        }
      })()
      return { success: true }
    } catch (error: any) {
      console.error("Failed to save full hierarchy:", error)
      throw new Error("Failed to save hierarchy changes: " + error.message)
    } finally {
      db.close()
    }
  })


