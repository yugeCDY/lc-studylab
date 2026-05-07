"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import {
  BookOpen,
  Database,
  FileSearch,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"
import { EnhancedMessageRenderer } from "@/components/chat/enhanced-message-renderer"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  buildRagIndex,
  deleteRagIndex,
  listRagIndexes,
  queryRag,
  searchRag,
  updateRagIndex,
  uploadRagDocuments,
} from "@/lib/api-client"
import type {
  EnhancedMessage,
  RagIndexInfo,
  RagSearchResult,
  RagUploadedFileInfo,
} from "@/lib/types"
import { toast } from "sonner"

type PendingUpload = {
  uploadedSubdir: string
  files: RagUploadedFileInfo[]
}

function formatNumber(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0"
  }
  return new Intl.NumberFormat("zh-CN").format(value)
}

function formatDateTime(value?: string) {
  if (!value) {
    return "未记录"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return format(date, "MM-dd HH:mm")
}

function sourceLabel(path: string) {
  const normalized = path.replace(/\\/g, "/")
  const parts = normalized.split("/")
  return parts[parts.length - 1] || path
}

export default function RagPage() {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [indexes, setIndexes] = useState<RagIndexInfo[]>([])
  const [selectedIndexName, setSelectedIndexName] = useState<string>("")
  const [isLoadingIndexes, setIsLoadingIndexes] = useState(true)
  const [isBuildingIndex, setIsBuildingIndex] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isAsking, setIsAsking] = useState(false)
  const [activeTab, setActiveTab] = useState("ask")
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)
  const [searchResults, setSearchResults] = useState<RagSearchResult[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [askInput, setAskInput] = useState("")
  const [buildForm, setBuildForm] = useState({
    indexName: "",
    description: "",
  })
  const [messages, setMessages] = useState<EnhancedMessage[]>([])

  const selectedIndex = useMemo(
    () => indexes.find((item) => item.name === selectedIndexName) ?? null,
    [indexes, selectedIndexName]
  )

  const refreshIndexes = useCallback(async () => {
    setIsLoadingIndexes(true)
    try {
      const data = await listRagIndexes()
      setIndexes(data)
      setSelectedIndexName((current) => {
        if (current && data.some((item) => item.name === current)) {
          return current
        }
        return data[0]?.name ?? ""
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载索引失败"
      toast.error("索引列表加载失败", { description: message })
    } finally {
      setIsLoadingIndexes(false)
    }
  }, [])

  useEffect(() => {
    void refreshIndexes()
  }, [refreshIndexes])

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    setIsUploading(true)
    try {
      const uploaded = await uploadRagDocuments(Array.from(files))
      setPendingUpload({
        uploadedSubdir: uploaded.target_directory,
        files: uploaded.files,
      })
      toast.success("资料已上传", {
        description: `共 ${uploaded.files.length} 个文件，已准备建库`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败"
      toast.error("上传资料失败", { description: message })
    } finally {
      setIsUploading(false)
    }
  }

  const handleOpenFilePicker = () => {
    uploadInputRef.current?.click()
  }

  const handleBuildIndex = async () => {
    if (!buildForm.indexName.trim()) {
      toast.warning("请先填写知识库名称")
      return
    }

    if (!pendingUpload?.uploadedSubdir) {
      toast.warning("请先上传资料")
      return
    }

    setIsBuildingIndex(true)
    try {
      const created = await buildRagIndex({
        indexName: buildForm.indexName.trim(),
        uploadedSubdir: pendingUpload.uploadedSubdir,
        description: buildForm.description.trim(),
      })

      toast.success("知识库创建成功", {
        description: `${created.name} 已可用于检索和问答`,
      })

      setBuildForm({ indexName: "", description: "" })
      setPendingUpload(null)
      await refreshIndexes()
      setSelectedIndexName(created.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建索引失败"
      toast.error("知识库创建失败", { description: message })
    } finally {
      setIsBuildingIndex(false)
    }
  }

  const handleAppendToIndex = async () => {
    if (!selectedIndexName) {
      toast.warning("请先选择一个知识库")
      return
    }

    if (!pendingUpload?.uploadedSubdir) {
      toast.warning("请先上传资料")
      return
    }

    setIsBuildingIndex(true)
    try {
      const updated = await updateRagIndex({
        indexName: selectedIndexName,
        uploadedSubdir: pendingUpload.uploadedSubdir,
      })
      toast.success("资料已追加到知识库", {
        description: `${updated.name} 已完成增量更新`,
      })
      setPendingUpload(null)
      await refreshIndexes()
      setSelectedIndexName(updated.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新索引失败"
      toast.error("追加资料失败", { description: message })
    } finally {
      setIsBuildingIndex(false)
    }
  }

  const handleDeleteIndex = async () => {
    if (!selectedIndexName) {
      return
    }

    const confirmed = window.confirm(`确认删除知识库“${selectedIndexName}”吗？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteRagIndex(selectedIndexName)
      toast.success("知识库已删除")
      setMessages([])
      setSearchResults([])
      await refreshIndexes()
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除失败"
      toast.error("删除知识库失败", { description: message })
    }
  }

  const handleSearch = async () => {
    if (!selectedIndexName) {
      toast.warning("请先选择知识库")
      return
    }

    if (!searchQuery.trim()) {
      toast.warning("请输入检索关键词")
      return
    }

    setIsSearching(true)
    try {
      const results = await searchRag({
        indexName: selectedIndexName,
        query: searchQuery.trim(),
        topK: 5,
      })
      setSearchResults(results)
      if (results.length === 0) {
        toast.info("没有找到匹配资料", {
          description: "可以换个关键词，或补充上传更多文档",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "检索失败"
      toast.error("资料检索失败", { description: message })
    } finally {
      setIsSearching(false)
    }
  }

  const handleAsk = async (message: PromptInputMessage) => {
    const question = message.text?.trim()
    if (!question) {
      return
    }

    if (!selectedIndexName) {
      toast.warning("请先选择知识库")
      return
    }

    const userMessage: EnhancedMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
    }

    setMessages((current) => [...current, userMessage])
    setAskInput("")
    setIsAsking(true)

    try {
      const result = await queryRag({
        indexName: selectedIndexName,
        query: question,
        topK: 4,
        returnSources: true,
      })

      const assistantMessage: EnhancedMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
        timestamp: new Date(),
        sources: result.sources.map((item, index) => ({
          href: item,
          title: sourceLabel(item) || `来源 ${index + 1}`,
          content: item,
        })),
        metadata: {
          retrieved_documents: result.retrieved_documents,
        },
      }

      setMessages((current) => [...current, assistantMessage])
      setSearchResults(
        result.retrieved_documents.map((item) => ({
          content: item.content,
          metadata: item.metadata,
          score: null,
        }))
      )
      setActiveTab("ask")
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "知识库问答失败"
      toast.error("知识库问答失败", { description: messageText })
      setMessages((current) => current.slice(0, -1))
    } finally {
      setIsAsking(false)
    }
  }

  const statCards = useMemo(() => {
    const totalDocuments = indexes.reduce((sum, item) => {
      const count = typeof item.num_documents === "number" ? item.num_documents : 0
      return sum + count
    }, 0)

    const totalSize = indexes.reduce((sum, item) => sum + (item.size_bytes ?? 0), 0)

    return [
      {
        label: "知识库总数",
        value: formatNumber(indexes.length),
        icon: Database,
        tone: "text-slate-700 bg-slate-100",
      },
      {
        label: "已索引片段",
        value: formatNumber(totalDocuments),
        icon: BookOpen,
        tone: "text-blue-700 bg-blue-100",
      },
      {
        label: "检索结果",
        value: formatNumber(searchResults.length),
        icon: FileSearch,
        tone: "text-emerald-700 bg-emerald-100",
      },
      {
        label: "索引体积",
        value: `${(totalSize / 1024 / 1024).toFixed(1)} MB`,
        icon: ShieldCheck,
        tone: "text-amber-700 bg-amber-100",
      },
    ]
  }, [indexes, searchResults.length])

  return (
    <AppLayout>
      <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.05),_transparent_34%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(241,245,249,0.94))]">
        <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-6 px-6 py-6">
          <section className="rounded-[28px] border border-slate-200/80 bg-white/88 p-6 shadow-[0_22px_70px_-38px_rgba(15,23,42,0.35)] backdrop-blur">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl space-y-3">
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-300 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-[0.24em] text-slate-600 uppercase"
                >
                  Enterprise Knowledge Desk
                </Badge>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                    RAG 知识库工作台
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    面向企业内部资料的上传、建库、检索与追问。保持和 Chat
                    菜单一致的问答节奏，同时把资料资产、索引状态和回答依据放到同一个工作面板里。
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {statCards.map((item) => (
                  <div
                    key={item.label}
                    className="min-w-[180px] rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                        {item.label}
                      </span>
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl",
                          item.tone
                        )}
                      >
                        <item.icon className="size-4" />
                      </span>
                    </div>
                    <div className="mt-4 text-2xl font-semibold text-slate-950">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid flex-1 gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="space-y-6">
              <Card className="border-slate-200/80 bg-white/92 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-slate-900">知识库信息</CardTitle>
                  <CardDescription>
                    先填写知识库名称和说明，再上传资料执行建库或增量更新。
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <form
                    className="isolate space-y-4"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <div className="space-y-2">
                      <label
                        htmlFor="rag-index-name"
                        className="block text-sm font-medium text-slate-800"
                      >
                        知识库名称
                      </label>
                      <input
                        id="rag-index-name"
                        name="rag-index-name"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="例如 hr-policy-2026"
                        value={buildForm.indexName}
                        onChange={(event) =>
                          setBuildForm((current) => ({
                            ...current,
                            indexName: event.target.value,
                          }))
                        }
                        className="pointer-events-auto relative z-20 block h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="rag-index-description"
                        className="block text-sm font-medium text-slate-800"
                      >
                        知识库说明
                      </label>
                      <textarea
                        id="rag-index-description"
                        name="rag-index-description"
                        placeholder="补充说明知识库用途、适用部门或资料范围"
                        value={buildForm.description}
                        onChange={(event) =>
                          setBuildForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        className="pointer-events-auto relative z-20 block min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                      />
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 bg-white/92 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-slate-900">资料上传与建库</CardTitle>
                  <CardDescription>
                    先上传资料，再新建知识库或增量追加到现有索引。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                        <Upload className="size-4" />
                      </span>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-slate-900">
                          上传企业资料
                        </div>
                        <div className="text-xs leading-5 text-slate-500">
                          支持 PDF、Markdown、TXT、HTML、JSON
                        </div>
                      </div>
                    </div>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      multiple
                      onChange={(event) => void handleFileUpload(event.target.files)}
                      className="hidden"
                      disabled={isUploading}
                    />
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleOpenFilePicker}
                        disabled={isUploading}
                        className="border-slate-200 bg-white"
                      >
                        <Upload className="size-4" />
                        选择资料文件
                      </Button>
                      <span className="text-xs text-slate-500">
                        选择后会上传到后端暂存区，随后可新建或追加知识库
                      </span>
                    </div>
                    {isUploading && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                        <Loader2 className="size-4 animate-spin" />
                        正在上传资料...
                      </div>
                    )}
                    {pendingUpload && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                        <div className="text-sm font-medium text-emerald-900">
                          已上传 {pendingUpload.files.length} 个文件
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {pendingUpload.files.map((file) => (
                            <Badge
                              key={file.saved_path}
                              variant="outline"
                              className="border-emerald-200 bg-white text-emerald-800"
                            >
                              {file.filename}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      onClick={() => void handleBuildIndex()}
                      disabled={isBuildingIndex || !pendingUpload}
                      className="bg-slate-900 text-white hover:bg-slate-800"
                    >
                      {isBuildingIndex ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Database className="size-4" />
                      )}
                      新建知识库
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleAppendToIndex()}
                      disabled={isBuildingIndex || !pendingUpload || !selectedIndexName}
                    >
                      {isBuildingIndex ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      追加到当前知识库
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 bg-white/92 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-slate-900">知识库列表</CardTitle>
                  <CardDescription>
                    选择一个索引作为当前检索和问答的工作上下文。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {isLoadingIndexes ? (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Loader2 className="size-4 animate-spin" />
                      正在加载知识库...
                    </div>
                  ) : indexes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm leading-6 text-slate-500">
                      还没有可用知识库。先上传资料并创建第一个企业知识库。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {indexes.map((index) => {
                        const isActive = index.name === selectedIndexName
                        return (
                          <button
                            key={index.name}
                            type="button"
                            onClick={() => setSelectedIndexName(index.name)}
                            className={cn(
                              "w-full rounded-2xl border px-4 py-4 text-left transition",
                              isActive
                                ? "border-slate-900 bg-slate-950 text-white shadow-lg shadow-slate-950/10"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold">
                                  {index.name}
                                </div>
                                <div
                                  className={cn(
                                    "mt-1 text-xs leading-5",
                                    isActive ? "text-slate-300" : "text-slate-500"
                                  )}
                                >
                                  {index.description || "未填写说明"}
                                </div>
                              </div>
                              <Badge
                                variant={isActive ? "secondary" : "outline"}
                                className={cn(
                                  "shrink-0",
                                  isActive
                                    ? "bg-white/12 text-white"
                                    : "border-slate-200 text-slate-700"
                                )}
                              >
                                {formatNumber(index.num_documents)} 片段
                              </Badge>
                            </div>
                            <div
                              className={cn(
                                "mt-3 flex flex-wrap gap-3 text-xs",
                                isActive ? "text-slate-300" : "text-slate-500"
                              )}
                            >
                              <span>更新于 {formatDateTime(index.updated_at)}</span>
                              <span>{(index.size_mb ?? 0).toFixed(1)} MB</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {selectedIndex && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            当前知识库
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {selectedIndex.name} · {selectedIndex.embedding_model}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDeleteIndex()}
                          className="text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex min-h-[760px] flex-col rounded-[28px] border border-slate-200/80 bg-white/92 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.35)]">
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-950">
                        知识检索与追问
                      </h2>
                      {selectedIndex && (
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-700"
                        >
                          {selectedIndex.name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-6 text-slate-500">
                      先做纯检索确认资料命中，再切到问答视角生成可追溯的答案。
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="font-medium text-slate-900">
                      回答策略
                    </div>
                    <div className="mt-1 text-xs leading-5">
                      仅基于当前知识库返回结果，并在答案下方保留来源引用。
                    </div>
                  </div>
                </div>
              </div>

              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="border-b border-slate-100 px-6 pt-4">
                  <TabsList className="h-11 rounded-2xl bg-slate-100 p-1">
                    <TabsTrigger
                      value="ask"
                      className="rounded-xl data-[state=active]:bg-white"
                    >
                      问答工作台
                    </TabsTrigger>
                    <TabsTrigger
                      value="search"
                      className="rounded-xl data-[state=active]:bg-white"
                    >
                      纯检索预览
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="ask" className="mt-0 flex min-h-0 flex-1 flex-col">
                  <div
                    className={cn(
                      "flex-1 overflow-y-auto",
                      messages.length === 0 && "flex items-center justify-center"
                    )}
                  >
                    <div className="mx-auto flex w-full max-w-[54rem] flex-col gap-8 px-6 py-8">
                      {messages.length === 0 ? (
                        <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 p-10 text-center">
                          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                            <BookOpen className="size-6" />
                          </div>
                          <h3 className="mt-5 text-2xl font-semibold text-slate-950">
                            围绕企业资料直接追问
                          </h3>
                          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                            适合制度条款核对、培训资料追问、产品知识确认和项目文档问答。建议先选定知识库，再输入明确问题。
                          </p>
                        </div>
                      ) : (
                        messages.map((message) => (
                          <EnhancedMessageRenderer
                            key={message.id}
                            message={message}
                            isStreaming={false}
                          />
                        ))
                      )}

                      {isAsking && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin" />
                            正在基于当前知识库生成答案...
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-white px-6 py-5">
                    <div className="mx-auto w-full max-w-[54rem]">
                      <PromptInput onSubmit={(message) => void handleAsk(message)}>
                        <PromptInputBody>
                          <PromptInputTextarea
                            placeholder={
                              selectedIndexName
                                ? `围绕 ${selectedIndexName} 提问，例如：这份制度里关于审批时效是怎么规定的？`
                                : "请先在左侧选择一个知识库"
                            }
                            value={askInput}
                            onChange={(event) => setAskInput(event.target.value)}
                            disabled={isAsking || !selectedIndexName}
                          />
                        </PromptInputBody>
                        <PromptInputFooter>
                          <PromptInputTools>
                            <div className="text-xs text-slate-500">
                              当前范围：{selectedIndexName || "未选择知识库"}
                            </div>
                          </PromptInputTools>
                          <PromptInputSubmit
                            disabled={!askInput.trim() || !selectedIndexName || isAsking}
                            status={isAsking ? "streaming" : "ready"}
                          />
                        </PromptInputFooter>
                      </PromptInput>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="search" className="mt-0 flex min-h-0 flex-1 flex-col">
                  <div className="border-b border-slate-100 px-6 py-5">
                    <div className="flex flex-col gap-3 lg:flex-row">
                      <Input
                        value={searchQuery}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                          setSearchQuery(event.target.value)
                        }
                        placeholder={
                          selectedIndexName
                            ? `在 ${selectedIndexName} 中搜索关键词或条款`
                            : "请先选择知识库"
                        }
                        disabled={!selectedIndexName || isSearching}
                        className="h-11"
                      />
                      <Button
                        onClick={() => void handleSearch()}
                        disabled={!selectedIndexName || !searchQuery.trim() || isSearching}
                        className="h-11 bg-slate-900 text-white hover:bg-slate-800"
                      >
                        {isSearching ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Search className="size-4" />
                        )}
                        开始检索
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="mx-auto w-full max-w-[60rem] space-y-4">
                      {searchResults.length === 0 ? (
                        <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 p-10 text-center">
                          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                            <FileSearch className="size-6" />
                          </div>
                          <h3 className="mt-5 text-2xl font-semibold text-slate-950">
                            先检索，再确认答案依据
                          </h3>
                          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                            这里会直接展示命中的资料片段，适合核验关键词、条款出处和资料覆盖范围。
                          </p>
                        </div>
                      ) : (
                        searchResults.map((result, index) => (
                          <Card
                            key={`${result.metadata?.source ?? "result"}-${index}`}
                            className="border-slate-200/80 bg-white"
                          >
                            <CardHeader className="border-b border-slate-100">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                  <CardTitle className="text-base text-slate-900">
                                    {sourceLabel(
                                      String(
                                        result.metadata?.filename ??
                                          result.metadata?.source ??
                                          `检索结果 ${index + 1}`
                                      )
                                    )}
                                  </CardTitle>
                                  <CardDescription className="mt-1">
                                    {String(result.metadata?.source ?? "未记录来源路径")}
                                  </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                  {result.score !== null && result.score !== undefined && (
                                    <Badge
                                      variant="outline"
                                      className="border-slate-200 text-slate-700"
                                    >
                                      相似度 {result.score.toFixed(3)}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className="border-blue-200 bg-blue-50 text-blue-700"
                                  >
                                    #{index + 1}
                                  </Badge>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-5">
                              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                                {result.content}
                              </p>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  )
}
