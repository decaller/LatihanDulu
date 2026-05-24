import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  RiFolderLine,
  RiFolderOpenLine,
  RiBookOpenLine,
  RiAddLine,
  RiEditLine,
  RiDeleteBin7Line,
  RiCornerDownRightLine,
  RiDatabase2Line,
  RiFileList3Line,
  RiCloseLine,
  RiCheckLine,
  RiAlertLine,
  RiNodeTree,
  RiInformationLine,
  RiLoader2Line,
} from "@remixicon/react"
import { motion, AnimatePresence } from "framer-motion"

import {
  getHierarchyTreeDataFn as _getHierarchyTreeDataFn,
  createHierarchyFolderFn as _createHierarchyFolderFn,
  renameHierarchyNodeFn as _renameHierarchyNodeFn,
  deleteHierarchyNodeFn as _deleteHierarchyNodeFn,
  saveFullHierarchyFn as _saveFullHierarchyFn,
} from "../lib/moderation"

import {
  TreeView,
  TreeViewDndContext,
} from "@/components/tree-view"

const getHierarchyTreeDataFn = _getHierarchyTreeDataFn as any
const createHierarchyFolderFn = _createHierarchyFolderFn as any
const renameHierarchyNodeFn = _renameHierarchyNodeFn as any
const deleteHierarchyNodeFn = _deleteHierarchyNodeFn as any
const saveFullHierarchyFn = _saveFullHierarchyFn as any

// TanStack Route definition
export const Route = createFileRoute("/silsilah")({
  loader: async () => {
    return await getHierarchyTreeDataFn()
  },
  component: SilsilahManagerDashboard,
})

function SilsilahManagerDashboard() {
  const { tree, unmappedArticles, stats } = Route.useLoaderData() as any
  const router = useRouter()

  // Local state for trees (for drag-and-drop reactivity)
  const [silsilahItems, setSilsilahItems] = useState<any[]>([])
  const [unmappedItems, setUnmappedItems] = useState<any[]>([])

  // Keep state in sync with loader data
  useEffect(() => {
    setSilsilahItems(tree || [])
  }, [tree])

  useEffect(() => {
    setUnmappedItems(unmappedArticles || [])
  }, [unmappedArticles])

  // Interactive UI states
  const [selectedNode, setSelectedNode] = useState<any | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Dialog Modals State
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createParentUrl, setCreateParentUrl] = useState<string>("https://ilmiyyah.com")
  const [newFolderTitle, setNewFolderTitle] = useState("")

  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [renameTargetUrl, setRenameTargetUrl] = useState("")
  const [renameTitle, setRenameTitle] = useState("")

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteTargetUrl, setDeleteTargetUrl] = useState("")

  // Quick category select state (fallback mapping method)
  const [isQuickMapOpen, setIsQuickMapOpen] = useState(false)
  const [quickMapArticleUrl, setQuickMapArticleUrl] = useState("")
  const [quickMapParentUrl, setQuickMapParentUrl] = useState("")

  // Expandable list of folders for parent selections
  const flatFolders = useMemo(() => {
    const folders: { url: string; title: string; depth: number }[] = [
      { url: "https://ilmiyyah.com", title: "Mulai (Root)", depth: 0 }
    ]

    const traverse = (nodes: any[], depth: number) => {
      nodes.forEach(node => {
        if (node.isGroup) {
          folders.push({
            url: node.id,
            title: node.data.title,
            depth: depth + 1
          })
          if (node.children) {
            traverse(node.children, depth + 1)
          }
        }
      })
    }

    traverse(silsilahItems, 0)
    return folders
  }, [silsilahItems])

  // Find a specific node by childUrl/id
  const findNode = (nodes: any[], id: string): any => {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findNode(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  // Handle Items Change (Same-tree drag or Cross-tree drag drops)
  const handleSilsilahChange = async (updatedItems: any[]) => {
    setSilsilahItems(updatedItems)
    await syncTreeToDatabase(updatedItems)
  }

  const handleUnmappedChange = async (updatedItems: any[]) => {
    setUnmappedItems(updatedItems)
    // If an item was dragged out of unmapped, it goes to silsilahItems.
    // The main sync will pick it up and save it!
  }

  // Core Sync Function: flattens the items structure and writes all relationships into SQLite
  const syncTreeToDatabase = async (currentSilsilah: any[]) => {
    setIsSubmitting(true)
    const updates: { childUrl: string; parentUrl: string; sequenceOrder: number }[] = []

    const traverse = (nodes: any[], parentUrl: string) => {
      nodes.forEach((node, index) => {
        updates.push({
          childUrl: node.id,
          parentUrl,
          sequenceOrder: index
        })
        if (node.children && node.children.length > 0) {
          traverse(node.children, node.id)
        }
      })
    }

    traverse(currentSilsilah, "https://ilmiyyah.com")

    try {
      await saveFullHierarchyFn({ data: updates })
      await router.invalidate()
    } catch (err: any) {
      alert("Gagal menyinkronkan struktur: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Action: Create Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFolderTitle.trim()) return

    setIsSubmitting(true)
    try {
      await createHierarchyFolderFn({
        data: {
          parentUrl: createParentUrl,
          title: newFolderTitle.trim()
        }
      })
      setNewFolderTitle("")
      setIsCreateOpen(false)
      await router.invalidate()
    } catch (err: any) {
      alert("Gagal membuat folder: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Action: Rename Folder/Link
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!renameTitle.trim()) return

    setIsSubmitting(true)
    try {
      await renameHierarchyNodeFn({
        data: {
          childUrl: renameTargetUrl,
          newTitle: renameTitle.trim()
        }
      })
      setIsRenameOpen(false)
      // Update selected node state immediately for smooth visual response
      if (selectedNode && selectedNode.id === renameTargetUrl) {
        setSelectedNode((prev: any) => ({
          ...prev,
          data: {
            ...prev.data,
            title: renameTitle.trim()
          }
        }))
      }
      await router.invalidate()
    } catch (err: any) {
      alert("Gagal mengubah nama: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Action: Safe Delete Node
  const handleDelete = async () => {
    setIsSubmitting(true)
    try {
      await deleteHierarchyNodeFn({
        data: {
          childUrl: deleteTargetUrl
        }
      })
      setIsDeleteOpen(false)
      setSelectedNode(null)
      await router.invalidate()
    } catch (err: any) {
      alert("Gagal menghapus materi: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Action: Quick Map Article (Fallback if DND isn't used)
  const handleQuickMap = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickMapArticleUrl || !quickMapParentUrl) return

    setIsSubmitting(true)
    try {
      const updates = [
        {
          childUrl: quickMapArticleUrl,
          parentUrl: quickMapParentUrl,
          sequenceOrder: 999 // Add to the very end
        }
      ]

      await saveFullHierarchyFn({ data: updates })
      setIsQuickMapOpen(false)
      await router.invalidate()
    } catch (err: any) {
      alert("Gagal menghubungkan materi: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Action: Remove mapping (returns article to unmapped list)
  const handleRemoveMapping = async (childUrl: string) => {
    if (!confirm("Keluarkan materi ini dari silsilah? Ia akan kembali ke daftar Materi Belum Terpetakan.")) return

    setIsSubmitting(true)
    try {
      await deleteHierarchyNodeFn({
        data: {
          childUrl
        }
      })
      setSelectedNode(null)
      await router.invalidate()
    } catch (err: any) {
      alert("Gagal mengeluarkan materi: " + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased select-none">
      {/* Header Info Panel */}
      <header className="sticky top-14 z-40 border-b border-border bg-background/85 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5 text-primary">
              <RiNodeTree className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Bismillah. Kelola Taksonomi Silsilah
              </h1>
              <p className="text-xs text-muted-foreground">
                Visualisasikan susunan silsilah kajian dan atur urutan artikel dengan drag-and-drop
              </p>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-card-foreground shadow-3xs">
              <RiFolderLine className="h-4 w-4 text-emerald-600" />
              <div className="text-xs">
                <span className="font-semibold">{flatFolders.length - 1}</span>
                <span className="ml-1 text-muted-foreground">Folder Kategori</span>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-card-foreground shadow-3xs">
              <RiFileList3Line className="h-4 w-4 text-amber-500" />
              <div className="text-xs">
                <span className="font-semibold">{stats.unmappedCount}</span>
                <span className="ml-1 text-muted-foreground">Belum Terpetakan</span>
              </div>
            </div>

            <Button
              onClick={() => {
                setCreateParentUrl("https://ilmiyyah.com")
                setIsCreateOpen(true)
              }}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-3xs"
            >
              <RiAddLine className="h-4 w-4" />
              <span>Buat Folder Kategori</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Drag-and-Drop Workspace Grid */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6 lg:flex-row items-stretch">
        <TreeViewDndContext
          onDragEnd={async (event: any) => {
            // Drag Drop Finished.
            // Check if dragging cross-tree (from Unmapped to Silsilah Tree)
            if (event.crossTree) {
              const { sourceTreeId, targetTreeId, projectedParentId } = event.crossTree
              const sourceId = (event.operation.source as any).id

              if (sourceTreeId === "unmapped-tree" && targetTreeId === "silsilah-tree") {
                // Dragged unmapped article into hierarchy!
                const sourceNode = unmappedItems.find(item => item.id === sourceId)
                if (sourceNode) {
                  // Find new parent node
                  const newParentUrl = projectedParentId || "https://ilmiyyah.com"

                  // Create node structure to insert
                  const newNode = {
                    id: sourceNode.id,
                    isGroup: false,
                    data: {
                      ...sourceNode.data,
                      parentUrl: newParentUrl,
                    }
                  }

                  // Splice/insert into silsilah items reactively
                  const updatedSilsilah = [...silsilahItems]
                  
                  if (newParentUrl === "https://ilmiyyah.com") {
                    updatedSilsilah.push(newNode)
                  } else {
                    const parentNode = findNode(updatedSilsilah, newParentUrl)
                    if (parentNode) {
                      if (!parentNode.children) parentNode.children = []
                      parentNode.children.push(newNode)
                    }
                  }

                  const updatedUnmapped = unmappedItems.filter(item => item.id !== sourceId)

                  setSilsilahItems(updatedSilsilah)
                  setUnmappedItems(updatedUnmapped)
                  await syncTreeToDatabase(updatedSilsilah)
                }
              }
            }
          }}
        >
          {/* LEFT PANEL: Silsilah Tree Map */}
          <main className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl border border-border bg-card p-4.5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <RiNodeTree className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold tracking-tight text-foreground">Struktur Taksonomi Silsilah</h3>
              </div>
              {isSubmitting && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <RiLoader2Line className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  Menyimpan...
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar bg-background/40 rounded-xl p-3 border border-border/50">
              {silsilahItems.length > 0 ? (
                <TreeView
                  treeId="silsilah-tree"
                  dndGroup="silsilah-dnd"
                  items={silsilahItems}
                  onItemsChange={handleSilsilahChange}
                  draggable={true}
                  droppable={true}
                  selectionMode="single"
                  onSelectedIdsChange={(ids) => {
                    if (ids.length > 0) {
                      const node = findNode(silsilahItems, ids[0])
                      setSelectedNode(node)
                    } else {
                      setSelectedNode(null)
                    }
                  }}
                  renderNode={({ node, isExpanded, isSelected, toggle, select, depth }) => {
                    const nodeData = node.data as any
                    const isArticle = nodeData.isArticle

                    return (
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          select()
                        }}
                        style={{ paddingLeft: `${depth * 20 + 10}px` }}
                        className={`flex items-center gap-2 rounded-lg pr-2.5 py-1.5 text-xs transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? "border border-primary/20 bg-primary/10 font-bold text-primary shadow-3xs"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        {node.isGroup ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              toggle()
                            }}
                            className="rounded p-0.5 transition-colors hover:bg-muted-foreground/10"
                          >
                            {isExpanded ? (
                              <RiFolderOpenLine className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <RiFolderLine className="h-4 w-4 text-muted-foreground/80" />
                            )}
                          </span>
                        ) : (
                          <RiBookOpenLine className="h-4 w-4 shrink-0 text-primary" />
                        )}

                        <span className="truncate flex-1 max-w-[400px] text-left select-none font-sans" title={nodeData.title}>
                          {nodeData.title}
                        </span>

                        {!isArticle && (
                          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground border border-border/40 select-none">
                            Folder
                          </span>
                        )}
                      </div>
                    )
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center text-xs text-muted-foreground">
                  <RiNodeTree className="h-10 w-10 text-muted-foreground/45 mb-2.5" />
                  Struktur silsilah kosong. Silakan buat folder baru!
                </div>
              )}
            </div>
          </main>

          {/* RIGHT PANEL: Unmapped Articles & Node Detail Drawer */}
          <aside className="w-full lg:w-96 flex flex-col gap-6 shrink-0">
            {/* selectedNode Detail Card */}
            <AnimatePresence mode="wait">
              {selectedNode ? (
                <motion.div
                  key="node-details"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="rounded-xl border border-border bg-card p-4.5 shadow-2xs flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-1.5">
                      <RiInformationLine className="h-4 w-4 text-primary" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Atribut Taksonomi</h4>
                    </div>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-all"
                    >
                      <RiCloseLine className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-3.5 text-xs text-left">
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Judul Materi</span>
                      <strong className="text-foreground leading-normal font-sans text-sm">{selectedNode.data.title}</strong>
                    </div>

                    <div>
                      <span className="text-muted-foreground block mb-0.5">Jenis Node</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 font-bold text-[9px] border ${
                        selectedNode.isGroup
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
                      }`}>
                        {selectedNode.isGroup ? "Folder Kategori" : "Artikel / Link"}
                      </span>
                    </div>

                    {!selectedNode.isGroup && selectedNode.data.speaker && (
                      <div>
                        <span className="text-muted-foreground block mb-0.5">Pemateri</span>
                        <span className="text-foreground font-semibold">{selectedNode.data.speaker}</span>
                      </div>
                    )}

                    <div>
                      <span className="text-muted-foreground block mb-0.5">URL Path / Identitas</span>
                      <code className="block select-text break-all rounded border border-border bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground leading-normal">
                        {selectedNode.id}
                      </code>
                    </div>
                  </div>

                  {/* Actions Drawer */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-border">
                    {selectedNode.isGroup ? (
                      <>
                        <Button
                          onClick={() => {
                            setCreateParentUrl(selectedNode.id)
                            setIsCreateOpen(true)
                          }}
                          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted shadow-3xs"
                        >
                          <RiAddLine className="h-4 w-4 text-emerald-600" />
                          <span>Buat Sub-Folder</span>
                        </Button>

                        <Button
                          onClick={() => {
                            setRenameTargetUrl(selectedNode.id)
                            setRenameTitle(selectedNode.data.title)
                            setIsRenameOpen(true)
                          }}
                          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted shadow-3xs"
                        >
                          <RiEditLine className="h-4 w-4 text-primary" />
                          <span>Ubah Nama Folder</span>
                        </Button>

                        <Button
                          onClick={() => {
                            setDeleteTargetUrl(selectedNode.id)
                            setIsDeleteOpen(true)
                          }}
                          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-500/10 shadow-3xs"
                        >
                          <RiDeleteBin7Line className="h-4 w-4" />
                          <span>Hapus Folder Kategori</span>
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => {
                            setRenameTargetUrl(selectedNode.id)
                            setRenameTitle(selectedNode.data.title)
                            setIsRenameOpen(true)
                          }}
                          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted shadow-3xs"
                        >
                          <RiEditLine className="h-4 w-4 text-primary" />
                          <span>Ubah Nama Teks Silsilah</span>
                        </Button>

                        <Button
                          onClick={() => handleRemoveMapping(selectedNode.id)}
                          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-500/10 shadow-3xs"
                        >
                          <RiCloseLine className="h-4 w-4" />
                          <span>Keluarkan dari Silsilah</span>
                        </Button>
                      </>
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* UNMAPPED PANEL */}
            <div className="flex-1 flex flex-col gap-4 rounded-xl border border-border bg-card p-4.5 shadow-2xs">
              <div className="border-b border-border pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RiDatabase2Line className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-bold tracking-tight text-foreground">Artikel Belum Terpetakan</h3>
                </div>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  {unmappedItems.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[50vh] custom-scrollbar space-y-2 bg-background/30 rounded-xl p-2.5 border border-border/50">
                {unmappedItems.length > 0 ? (
                  <TreeView
                    treeId="unmapped-tree"
                    dndGroup="silsilah-dnd"
                    items={unmappedItems}
                    onItemsChange={handleUnmappedChange}
                    draggable={true}
                    droppable={false} // Only allow dragging out
                    renderNode={({ node }) => {
                      const nodeData = node.data as any
                      return (
                        <div className="group/unmapped flex items-center gap-2 border border-border/60 bg-card rounded-xl p-3 text-xs transition-all duration-150 hover:border-amber-500/30 hover:shadow-3xs text-left w-full select-none cursor-grab active:cursor-grabbing">
                          <RiBookOpenLine className="h-4 w-4 text-amber-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <h5 className="font-bold text-foreground truncate max-w-[240px] font-sans" title={nodeData.title}>
                              {nodeData.title}
                            </h5>
                            <span className="text-[10px] text-muted-foreground">{nodeData.speaker}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setQuickMapArticleUrl(node.id)
                              setQuickMapParentUrl(flatFolders[0]?.url || "https://ilmiyyah.com")
                              setIsQuickMapOpen(true)
                            }}
                            className="rounded-md p-1 border border-border bg-card hover:bg-primary/10 hover:text-primary hover:border-primary/20 shrink-0 text-muted-foreground transition-all cursor-pointer"
                            title="Hubungkan Kategori"
                          >
                            <RiCornerDownRightLine className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground">
                    <RiCheckLine className="h-9 w-9 text-emerald-500 mb-2" />
                    Alhamdulillah, seluruh transkrip artikel kajian telah dipetakan!
                  </div>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground leading-relaxed text-left bg-muted/40 p-2.5 rounded-lg border border-border/50">
                💡 **Tips:** Drag artikel dari list di atas dan drop masuk ke dalam folder silsilah di sebelah kiri untuk memetakan kategori kajian secara instan.
              </p>
            </div>
          </aside>
        </TreeViewDndContext>
      </div>

      {/* CREATE DIALOG MODAL */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md rounded-xl border border-border bg-card p-5.5 shadow-2xl text-left"
            >
              <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                <h3 className="text-sm font-bold text-foreground">Buat Folder Kategori Baru</h3>
                <button onClick={() => setIsCreateOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
                  <RiCloseLine className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleCreateFolder} className="space-y-4 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">Nama Folder Baru</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Silsilah Aqidah"
                    value={newFolderTitle}
                    onChange={(e) => setNewFolderTitle(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-muted-foreground block mb-1">Pilih Folder Induk (Parent)</label>
                  <select
                    value={createParentUrl}
                    onChange={(e) => setCreateParentUrl(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none cursor-pointer"
                  >
                    {flatFolders.map((folder) => (
                      <option key={folder.url} value={folder.url}>
                        {"  ".repeat(folder.depth) + (folder.depth > 0 ? "└─ " : "") + folder.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)} className="h-8 text-xs font-semibold px-3 py-1 cursor-pointer">
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="h-8 text-xs font-bold px-4 py-1 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer">
                    {isSubmitting ? "Membuat..." : "Buat Folder"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RENAME DIALOG MODAL */}
      <AnimatePresence>
        {isRenameOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsRenameOpen(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md rounded-xl border border-border bg-card p-5.5 shadow-2xl text-left"
            >
              <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                <h3 className="text-sm font-bold text-foreground">Ubah Nama Node</h3>
                <button onClick={() => setIsRenameOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
                  <RiCloseLine className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleRename} className="space-y-4 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">Nama Baru</label>
                  <input
                    type="text"
                    required
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button type="button" variant="ghost" onClick={() => setIsRenameOpen(false)} className="h-8 text-xs font-semibold px-3 py-1 cursor-pointer">
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="h-8 text-xs font-bold px-4 py-1 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer">
                    {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {isDeleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsDeleteOpen(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5.5 shadow-2xl text-left"
            >
              <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
                <RiAlertLine className="h-5 w-5 text-red-600 animate-bounce shrink-0" />
                <h3 className="text-sm font-bold text-foreground">Hapus Folder Kategori?</h3>
              </div>

              <div className="text-xs text-muted-foreground space-y-2 mb-5 leading-normal">
                <p>Apakah antum yakin ingin menghapus folder ini?</p>
                <p className="bg-red-500/5 rounded border border-red-500/10 p-2 text-red-600">
                  ⚠️ **Perhatian:** Setiap sub-folder dan artikel di dalamnya tidak akan terhapus secara permanen. Mereka akan **di-orphan** (dipindahkan naik satu tingkat ke folder induk) agar data tidak hilang.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border text-xs">
                <Button type="button" variant="ghost" onClick={() => setIsDeleteOpen(false)} className="h-8 font-semibold px-3 py-1 cursor-pointer">
                  Batal
                </Button>
                <Button type="button" disabled={isSubmitting} onClick={handleDelete} className="h-8 font-bold px-4 py-1 bg-red-600 text-white hover:bg-red-700 cursor-pointer animate-pulse">
                  {isSubmitting ? "Menghapus..." : "Hapus Kategori"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QUICK MAP FORM MODAL (Fallback click adding) */}
      <AnimatePresence>
        {isQuickMapOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsQuickMapOpen(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md rounded-xl border border-border bg-card p-5.5 shadow-2xl text-left"
            >
              <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                <h3 className="text-sm font-bold text-foreground">Petakan Materi ke Folder</h3>
                <button onClick={() => setIsQuickMapOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
                  <RiCloseLine className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleQuickMap} className="space-y-4 text-xs">
                <div>
                  <label className="text-muted-foreground block mb-1">Materi Kajian</label>
                  <input
                    type="text"
                    disabled
                    value={unmappedItems.find(item => item.id === quickMapArticleUrl)?.data.title || ""}
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-muted-foreground block mb-1">Pilih Folder Kategori</label>
                  <select
                    value={quickMapParentUrl}
                    onChange={(e) => setQuickMapParentUrl(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none cursor-pointer"
                  >
                    {flatFolders.map((folder) => (
                      <option key={folder.url} value={folder.url}>
                        {"  ".repeat(folder.depth) + (folder.depth > 0 ? "└─ " : "") + folder.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button type="button" variant="ghost" onClick={() => setIsQuickMapOpen(false)} className="h-8 text-xs font-semibold px-3 py-1 cursor-pointer">
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="h-8 text-xs font-bold px-4 py-1 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer">
                    {isSubmitting ? "Menghubungkan..." : "Hubungkan"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
