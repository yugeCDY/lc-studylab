# LC-StudyLab 7 天学习路径

> 从零开始掌握这个 LangChain v1.0.3 全栈项目的**推荐学习路线**
>
> 每天约 **1.5–2 小时**，按「启动 → 跑通 → 读主线 → 逐阶段深入 → 做小练习」闭环设计

---

## 准备工作

| 事项 | 说明 |
|------|------|
| Python 3.10+ | `python --version` 确认 |
| Node.js 18+ | `node --version` 确认 |
| pnpm | `npm i -g pnpm` |
| API Key | 最少需要 OpenAI Key，填入 `backend/.env` 的 `OPENAI_API_KEY` |
| 编辑器 | VS Code 或 PyCharm |

---

## Day 1：项目启动 + 跑通全链路

**目标**：后端和前端都能正常启动，看到聊天界面能正常对话。

### 步骤

1. **读项目总览**
   - 读根目录 [README.md](README.md)，理解 5 个阶段的核心特性
   - 搞清项目定位：学习 LangChain 的全栈实践平台

2. **后端启动**

   ```powershell
   cd backend
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   # 复制 .env.example 为 .env，填入 OPENAI_API_KEY
   python -m api.http_server
   ```

3. **验证后端**
   - 打开 `http://localhost:8000/docs`
   - 点 `POST /chat` → "Try it out" → 发送 `{"message":"你好","mode":"default","use_tools":true}`

4. **前端启动**（新开终端）

   ```powershell
   cd frontend
   pnpm install
   "NEXT_PUBLIC_API_URL=http://localhost:8000" | Out-File -Encoding utf8 .env.local
   pnpm dev
   ```

5. **前端体验**
   - 打开 `http://localhost:3000`
   - 输入"现在几点？"、"计算 123+456"、"搜索 LangChain"，观察流式输出

6. **小练习**
   - 修改 [backend/core/prompts.py](backend/core/prompts.py) 第 32 行的默认提示词（如把"专业"改成"幽默"）
   - 重启后端，看 AI 语气变化

### 核心文件

| 文件 | 作用 |
|------|------|
| [http_server.py](backend/api/http_server.py) | FastAPI 应用入口 |
| [settings.py](backend/config/settings.py) | 配置管理（环境变量） |
| [prompts.py](backend/core/prompts.py) | 系统提示词模板 |

---

## Day 2：后端主线 —— 请求全链路

**目标**：从「用户点发送 → 前端发出请求 → 后端处理 → 返回流式数据」完整走一遍。

### 步骤

1. **前端入口**
   - 读 [chat/page.tsx](frontend/app/chat/page.tsx)（仅 8 行）
   - 读 [home page](frontend/app/page.tsx)（路由重定向到 /chat）

2. **前端流式 Hook**
   - 精读 [use-enhanced-chat.ts](frontend/hooks/use-enhanced-chat.ts)
   - 重点：`sendMessage` 函数（第 245–329 行），理解创建消息 → 发请求 → 处理 chunk

3. **API 客户端**
   - 精读 [api-client-enhanced.ts](frontend/lib/api-client-enhanced.ts)
   - 重点：`chatStreamEnhanced`（第 48–137 行），理解 SSE 事件解析

4. **后端入口**
   - 精读 [http_server.py](backend/api/http_server.py)
   - 重点：`lifespan`（启动逻辑）、路由注册（第 167–177 行）

5. **聊天路由**
   - 精读 [chat.py](backend/api/routers/chat.py)
   - 重点：`POST /chat/stream` 的 `generate()` 函数（第 313–666 行），理解 SSE 生成流程

6. **Agent 核心**
   - 精读 [base_agent.py](backend/agents/base_agent.py)
   - 重点：`__init__`（第 69–173 行）、`ainvoke`（第 322–376 行）

7. **小练习**
   - 在 `chat.py` 的 `generate()` 里加一个 `type: "ping"` 的 SSE 事件
   - 在 `api-client-enhanced.ts` 的 yield 之前加 `console.log` 验证

### 核心文件

| 文件 | 作用 |
|------|------|
| [use-enhanced-chat.ts](frontend/hooks/use-enhanced-chat.ts) | 前端流式聊天 Hook |
| [api-client-enhanced.ts](frontend/lib/api-client-enhanced.ts) | SSE 流式客户端 |
| [chat.py](backend/api/routers/chat.py) | 聊天 API 路由 |
| [base_agent.py](backend/agents/base_agent.py) | Agent 封装 |

---

## Day 3：阶段一 —— Agent + 工具调用

**目标**：深入理解 `create_agent`、工具注册、流式模式。

### 步骤

1. **Agent 核心**
   - 精读 [base_agent.py](backend/agents/base_agent.py) 全文（约 490 行）
   - 理解 `invoke` / `stream` / `ainvoke` / `astream` 四个方法

2. **工具模块**
   - 读 [core/tools/__init__.py](backend/core/tools/__init__.py)，看工具如何注册
   - 读 [calculator.py](backend/core/tools/calculator.py)、[time_tools.py](backend/core/tools/time_tools.py)、[web_search.py](backend/core/tools/web_search.py)

3. **提示词模板**
   - 精读 [prompts.py](backend/core/prompts.py)
   - 理解 5 种模式：default / coding / research / concise / detailed
   - 理解 `TOOL_USAGE_INSTRUCTIONS` 的天气查询规则

4. **模型配置**
   - 读 [models.py](backend/core/models.py)
   - 重点关注 `get_chat_model` 和 `get_streaming_model`

5. **CLI 测试**
   - 运行 `python scripts/demo_cli.py`
   - 输入 `/tools` 看效果，输入若干问题体验

6. **小练习**
   - 在 [core/tools/](backend/core/tools/) 目录下新建 `joke.py`
   - 写一个 `tell_joke()` 返回冷笑话
   - 在 `tools/__init__.py` 注册到 `ALL_TOOLS`
   - 重启后端验证

### 核心文件

| 文件 | 作用 |
|------|------|
| [base_agent.py](backend/agents/base_agent.py) | Agent 封装（核心） |
| [prompts.py](backend/core/prompts.py) | 提示词模板 |
| [tools/](backend/core/tools/) | 工具集合 |
| [models.py](backend/core/models.py) | 模型工厂 |
| [demo_cli.py](backend/scripts/demo_cli.py) | CLI 交互工具 |

---

## Day 4：阶段二 —— RAG 知识库系统

**目标**：理解文档加载 → 切分 → 向量化 → 索引 → 检索的完整流水线。

### 步骤

1. **认识模块结构**
   - 看 [rag/](backend/rag/) 目录下的文件列表

2. **文档加载**
   - 读 [loaders.py](backend/rag/loaders.py)
   - 理解如何加载 PDF、MD、TXT、HTML 等格式

3. **文本分块**
   - 读 [splitters.py](backend/rag/splitters.py)
   - 理解 `chunk_size` / `chunk_overlap` 参数的作用

4. **索引管理**
   - 读 [index_manager.py](backend/rag/index_manager.py)
   - 读 [vector_stores.py](backend/rag/vector_stores.py)
   - 理解 FAISS 索引的创建/保存/加载

5. **检索器**
   - 读 [retrievers.py](backend/rag/retrievers.py)
   - 理解 3 种检索策略：相似度 / MMR / 阈值过滤

6. **RAG Agent**
   - 读 [rag_agent.py](backend/rag/rag_agent.py)
   - 理解 Agent + 检索器的结合方式

7. **跑 RAG CLI**
   - `python scripts/rag_cli.py`
   - 输入"什么是机器学习？"，观察 RAG 回答的效果

8. **小练习**
   - 在 [data/documents/test/](backend/data/documents/test/) 下新建自己的 `.md` 文件
   - 运行 `python scripts/update_index.py` 更新索引
   - 查询自己写的内容能否被检索到

### 核心文件

| 文件 | 作用 |
|------|------|
| [loaders.py](backend/rag/loaders.py) | 多格式文档加载 |
| [splitters.py](backend/rag/splitters.py) | 文本分块策略 |
| [index_manager.py](backend/rag/index_manager.py) | 索引生命周期管理 |
| [vector_stores.py](backend/rag/vector_stores.py) | 向量存储（FAISS） |
| [retrievers.py](backend/rag/retrievers.py) | 多种检索策略 |
| [rag_agent.py](backend/rag/rag_agent.py) | RAG Agent |
| [rag_cli.py](backend/scripts/rag_cli.py) | RAG CLI 工具 |

---

## Day 5：阶段三 —— LangGraph 工作流

**目标**：理解有状态的工作流（图 + 节点 + 边 + 检查点）。

### 步骤

1. **状态定义**
   - 读 [state.py](backend/workflows/state.py)
   - 理解 State 的字段设计

2. **工作流节点**
   - 读 [nodes/](backend/workflows/nodes/) 下的 5 个文件：
     - `planner_node.py` — 学习规划
     - `retrieval_node.py` — 知识检索
     - `quiz_generator_node.py` — 出题
     - `grading_node.py` — 评分
     - `feedback_node.py` — 反馈

3. **图构建**
   - 读 [study_flow_graph.py](backend/workflows/study_flow_graph.py)
   - 理解节点如何连接成图、条件边如何路由

4. **Web 接口**
   - 读 [workflow.py](backend/api/routers/workflow.py)
   - 理解 SSE 如何输出工作流事件

5. **跑测试脚本**
   - `python scripts/test_workflow.py`
   - 观察完整流程：规划 → 检索 → 出题 → 评分 → 反馈

6. **小练习**
   - 在 [workflows/nodes/](backend/workflows/nodes/) 下新建 `summary_node.py`
   - 功能：在学习完成后生成摘要
   - 将其添加到 [study_flow_graph.py](backend/workflows/study_flow_graph.py) 中作为最后一个节点

### 核心文件

| 文件 | 作用 |
|------|------|
| [state.py](backend/workflows/state.py) | 工作流状态定义 |
| [study_flow_graph.py](backend/workflows/study_flow_graph.py) | 图构建和路由 |
| [nodes/](backend/workflows/nodes/) | 各功能节点 |
| [workflow.py](backend/api/routers/workflow.py) | 工作流 API |

---

## Day 6：阶段四 + 阶段五 —— DeepAgents & Guardrails

**目标**：理解多智能体协作和安全管理机制。

### 步骤

1. **深度研究 Agent**
   - 读 [deep_agent.py](backend/deep_research/deep_agent.py)
   - 理解主 Agent 如何协调子 Agent

2. **子智能体**
   - 读 [subagents.py](backend/deep_research/subagents.py)
   - 理解 WebResearcher / DocAnalyst / ReportWriter 的分工

3. **安全版本**
   - 读 [safe_deep_agent.py](backend/deep_research/safe_deep_agent.py)
   - 对比与普通版的区别

4. **Guardrails 概览**
   - 浏览 [core/guardrails/](backend/core/guardrails/) 下的文件列表

5. **内容过滤**
   - 读 [content_filters.py](backend/core/guardrails/content_filters.py)
   - 读 [input_validators.py](backend/core/guardrails/input_validators.py)
   - 理解 prompt injection 检测和敏感信息过滤

6. **输出验证**
   - 读 [output_validators.py](backend/core/guardrails/output_validators.py)
   - 读 [schemas.py](backend/core/guardrails/schemas.py)
   - 理解结构化输出验证

7. **中间件**
   - 读 [middleware.py](backend/core/guardrails/middleware.py)
   - 理解 Guardrails 如何嵌入请求流程

8. **小练习**
   - 运行 `python scripts/test_guardrails.py`
   - 修改 `content_filters.py`，加一个自定义敏感词（如"考试答案"）
   - 重启后端验证过滤效果

### 核心文件

| 文件 | 作用 |
|------|------|
| [deep_agent.py](backend/deep_research/deep_agent.py) | 深度研究主 Agent |
| [subagents.py](backend/deep_research/subagents.py) | 子智能体分工 |
| [content_filters.py](backend/core/guardrails/content_filters.py) | 内容过滤 |
| [input_validators.py](backend/core/guardrails/input_validators.py) | 输入验证 |
| [output_validators.py](backend/core/guardrails/output_validators.py) | 输出验证 |
| [schemas.py](backend/core/guardrails/schemas.py) | Pydantic Schema |
| [middleware.py](backend/core/guardrails/middleware.py) | 中间件集成 |

---

## Day 7：前端补全 + 自主实践

**目标**：把前端未完成的页面串起来，做一个完整的"小功能"作为结业项目。

### 步骤

1. **前端全局布局**
   - 读 [layout/](frontend/components/layout/) 下的 3 个文件：
     - `app-layout.tsx` — 全局布局
     - `app-header.tsx` — 顶部导航
     - `app-sidebar.tsx` — 左侧边栏

2. **AI Elements 组件**
   - 浏览 [components/ai-elements/](frontend/components/ai-elements/) 目录（30+ 组件）
   - 重点关注：`conversation`、`message`、`prompt-input`、`sources`、`reasoning`、`tool`

3. **消息管理器**
   - 读 [message-manager.ts](frontend/lib/message-manager.ts)
   - 理解消息状态如何管理

4. **类型系统**
   - 读 [types.ts](frontend/lib/types.ts)
   - 重点关注 `StreamChunk` 联合类型定义了哪些事件

5. **端到端聊天组件**
   - 读 [chat-enhanced.tsx](frontend/components/chat/chat-enhanced.tsx)
   - 理解一个完整的前端聊天组件如何拆分

6. **结业项目（三选一）**

   **选项 A：加一个新的 Agent 模式**
   - 后端：在 [prompts.py](backend/core/prompts.py) 添加新模式
   - 前端：在 [types.ts](frontend/lib/types.ts) 加上类型
   - 前端：在 [session.ts](frontend/lib/session.ts) 加标签和描述

   **选项 B：实现 RAG 页面**
   - 完善 [rag/page.tsx](frontend/app/rag/page.tsx)
   - 加一个输入框 + 调用后端 RAG 接口
   - 展示检索结果和来源

   **选项 C：给 Guardrails 加一个规则**
   - 后端：在 [input_validators.py](backend/core/guardrails/input_validators.py) 加"输入长度限制"
   - 前端：显示拦截提示

### 核心文件

| 文件 | 作用 |
|------|------|
| [layout/](frontend/components/layout/) | 页面布局框架 |
| [components/ai-elements/](frontend/components/ai-elements/) | AI UI 组件库 |
| [message-manager.ts](frontend/lib/message-manager.ts) | 消息状态管理 |
| [types.ts](frontend/lib/types.ts) | TypeScript 类型定义 |
| [chat-enhanced.tsx](frontend/components/chat/chat-enhanced.tsx) | 完整聊天组件 |

---

## 7 天总览

| 天 | 核心主题 | 读的主要文件 | CLI / 操作 |
|----|----------|-------------|------------|
| 1 | 启动全链路 | README × 3 | `pnpm dev`、`python -m api.http_server` |
| 2 | 请求链路 | `chat.py`、`use-enhanced-chat.ts` | 改 SSE 事件类型 |
| 3 | Agent + 工具 | `base_agent.py`、`prompts.py`、`tools/` | `demo_cli.py`、加工具 |
| 4 | RAG 系统 | `loaders.py`、`index_manager.py`、`rag_agent.py` | `rag_cli.py`、加文档 |
| 5 | LangGraph 工作流 | `study_flow_graph.py`、`nodes/` | `test_workflow.py`、加节点 |
| 6 | DeepAgents + Guardrails | `deep_agent.py`、`content_filters.py` | `test_guardrails.py`、加敏感词 |
| 7 | 前端 + 结业项目 | `layout/`、`ai-elements/`、`types.ts` | 加 mode / RAG 页面 / 加规则 |

---

## 快速参考

### 启动命令

```powershell
# 后端（backend 目录下）
.\venv\Scripts\Activate.ps1
uvicorn api.http_server:app --host 0.0.0.0 --port 8000 --reload

# 前端（frontend 目录下）
pnpm dev
```

### CLI 工具

```powershell
# backend 目录下，虚拟环境中执行
python scripts/demo_cli.py           # 普通聊天
python scripts/rag_cli.py            # RAG 聊天
python scripts/test_workflow.py      # 工作流测试
python scripts/test_guardrails.py    # 安全机制测试
```

### API 文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 学习建议

1. **每天动手** — 光读代码不动手效果减半，每天至少改一行代码再重启验证
2. **记笔记** — 画你自己的"架构图"，把当天读的文件名、主要类/函数名、调用关系画出来
3. **问 AI** — 遇到看不懂的代码，直接问这个 AI 助手
4. **循序渐进** — 不要急着一天看完所有 5 个阶段，按 7 天节奏走即可
5. **先后端再前端** — 项目核心在后端，优先吃透 Agent → RAG → Workflow → DeepAgents → Guardrails 这条线

---

*Happy Learning! 🚀*
