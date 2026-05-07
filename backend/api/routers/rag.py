"""
RAG API 路由

提供 RAG 相关的 HTTP 接口：
- 索引管理（创建、列表、删除、统计）
- 文档管理（上传、添加目录）
- 查询接口（RAG 问答、纯检索）
- 流式查询接口

使用 FastAPI 实现 RESTful API。
"""

import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json
import asyncio

from config import settings, get_logger
from rag import (
    IndexManager,
    load_document,
    load_directory,
    split_documents,
    get_embeddings,
    create_retriever,
    create_rag_agent,
    query_rag_agent,
)

logger = get_logger(__name__)
BACKEND_BASE_DIR = Path(__file__).resolve().parents[2]

# 创建路由器
router = APIRouter(prefix="/rag", tags=["RAG"])

# 全局索引管理器
index_manager = IndexManager()


# ==================== Pydantic 模型 ====================

class CreateIndexRequest(BaseModel):
    """创建索引请求"""
    name: str = Field(..., description="索引名称")
    directory_path: Optional[str] = Field(default=None, description="文档目录路径")
    uploaded_subdir: Optional[str] = Field(default=None, description="上传子目录名称")
    description: str = Field(default="", description="索引描述")
    chunk_size: Optional[int] = Field(default=None, description="分块大小")
    chunk_overlap: Optional[int] = Field(default=None, description="分块重叠")
    overwrite: bool = Field(default=False, description="是否覆盖已存在的索引")


class IndexInfo(BaseModel):
    """索引信息"""
    name: str
    description: str
    created_at: str
    updated_at: str
    num_documents: int
    store_type: str = "faiss"
    embedding_model: str


class QueryRequest(BaseModel):
    """查询请求"""
    index_name: str = Field(..., description="索引名称")
    query: str = Field(..., description="查询问题")
    k: Optional[int] = Field(default=4, description="返回文档数量")
    return_sources: bool = Field(default=True, description="是否返回来源")


class QueryResponse(BaseModel):
    """查询响应"""
    answer: str
    sources: List[str] = []
    retrieved_documents: List[dict] = []


class SearchRequest(BaseModel):
    """检索请求（纯检索，不生成回答）"""
    index_name: str = Field(..., description="索引名称")
    query: str = Field(..., description="检索查询")
    k: Optional[int] = Field(default=4, description="返回文档数量")
    score_threshold: Optional[float] = Field(default=None, description="相似度阈值")


class SearchResult(BaseModel):
    """检索结果"""
    content: str
    metadata: dict
    score: Optional[float] = None


class UploadedFileInfo(BaseModel):
    """上传文件信息"""
    filename: str
    saved_path: str
    size_bytes: int


class UploadDocumentsResponse(BaseModel):
    """上传文档响应"""
    success: bool
    message: str
    target_directory: str
    files: List[UploadedFileInfo]


class UpdateIndexRequest(BaseModel):
    """增量更新索引请求"""
    directory_path: Optional[str] = Field(default=None, description="文档目录路径")
    uploaded_subdir: Optional[str] = Field(default=None, description="上传子目录名称")
    chunk_size: Optional[int] = Field(default=None, description="分块大小")
    chunk_overlap: Optional[int] = Field(default=None, description="分块重叠")


def _resolve_source_directory(
    directory_path: Optional[str] = None,
    uploaded_subdir: Optional[str] = None,
) -> Path:
    """解析用于建库或更新索引的源目录"""
    if uploaded_subdir:
        upload_base = (BACKEND_BASE_DIR / settings.data_uploads_path).resolve()
        target = (upload_base / uploaded_subdir).resolve()
        if not str(target).startswith(str(upload_base)):
            raise HTTPException(status_code=400, detail="非法的上传目录")
        return target

    if directory_path:
        raw_path = Path(directory_path)
        if raw_path.is_absolute():
            return raw_path
        return (BACKEND_BASE_DIR / raw_path).resolve()

    raise HTTPException(
        status_code=400,
        detail="必须提供 directory_path 或 uploaded_subdir",
    )


# ==================== 索引管理接口 ====================

@router.post("/index", response_model=IndexInfo)
async def create_index(request: CreateIndexRequest):
    """
    创建新索引
    
    从指定目录加载文档，创建向量索引。
    
    Example:
        ```bash
        curl -X POST "http://localhost:8000/rag/index" \\
          -H "Content-Type: application/json" \\
          -d '{
            "name": "my_docs",
            "directory_path": "data/documents/test",
            "description": "测试文档索引",
            "chunk_size": 1000
          }'
        ```
    """
    try:
        logger.info(f"📝 创建索引请求: {request.name}")
        
        # 检查目录是否存在
        directory_path = _resolve_source_directory(
            directory_path=request.directory_path,
            uploaded_subdir=request.uploaded_subdir,
        )
        if not directory_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"目录不存在: {directory_path}"
            )
        
        # 检查索引是否已存在
        if index_manager.index_exists(request.name) and not request.overwrite:
            raise HTTPException(
                status_code=409,
                detail=f"索引已存在: {request.name}。使用 overwrite=true 来覆盖。"
            )
        
        # 加载文档
        logger.info(f"📂 加载文档: {directory_path}")
        documents = load_directory(str(directory_path))
        
        if not documents:
            raise HTTPException(
                status_code=400,
                detail="目录中没有找到支持的文档"
            )
        
        # 分块文档
        logger.info("✂️  分块文档...")
        chunks = split_documents(
            documents,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
        )
        
        # 创建 embeddings
        logger.info("🔢 创建 embeddings...")
        embeddings = get_embeddings()
        
        # 创建索引
        logger.info("🗄️  创建向量索引...")
        index_manager.create_index(
            name=request.name,
            documents=chunks,
            embeddings=embeddings,
            description=request.description,
            overwrite=request.overwrite,
        )
        
        # 获取索引信息
        index_info = index_manager.get_index_info(request.name)
        
        logger.info(f"✅ 索引创建成功: {request.name}")
        return IndexInfo(**index_info)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 创建索引失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/index/list", response_model=List[IndexInfo])
async def list_indexes():
    """
    列出所有索引
    
    Example:
        ```bash
        curl "http://localhost:8000/rag/index/list"
        ```
    """
    try:
        indexes = index_manager.list_indexes()
        return [IndexInfo(**idx) for idx in indexes]
    except Exception as e:
        logger.error(f"❌ 列出索引失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/index/{name}", response_model=IndexInfo)
async def get_index_info(name: str):
    """
    获取索引详细信息
    
    Example:
        ```bash
        curl "http://localhost:8000/rag/index/my_docs"
        ```
    """
    try:
        index_info = index_manager.get_index_info(name)
        
        if not index_info:
            raise HTTPException(
                status_code=404,
                detail=f"索引不存在: {name}"
            )
        
        return IndexInfo(**index_info)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 获取索引信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/index/{name}")
async def delete_index(name: str):
    """
    删除索引
    
    Example:
        ```bash
        curl -X DELETE "http://localhost:8000/rag/index/my_docs"
        ```
    """
    try:
        if not index_manager.index_exists(name):
            raise HTTPException(
                status_code=404,
                detail=f"索引不存在: {name}"
            )
        
        index_manager.delete_index(name)
        
        return {"message": f"索引已删除: {name}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 删除索引失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload", response_model=UploadDocumentsResponse)
async def upload_documents(
    files: List[UploadFile] = File(..., description="待上传的文档文件"),
):
    """
    上传文档到后端上传目录

    用于前端“上传资料建库”的第一步。
    """
    if not files:
        raise HTTPException(status_code=400, detail="未提供上传文件")

    upload_root = (BACKEND_BASE_DIR / settings.data_uploads_path).resolve()
    batch_name = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    target_dir = upload_root / batch_name
    target_dir.mkdir(parents=True, exist_ok=True)

    saved_files: List[UploadedFileInfo] = []

    try:
        for upload in files:
            if not upload.filename:
                continue

            safe_name = Path(upload.filename).name
            destination = target_dir / safe_name

            with destination.open("wb") as buffer:
                shutil.copyfileobj(upload.file, buffer)

            saved_files.append(
                UploadedFileInfo(
                    filename=safe_name,
                    saved_path=str(destination),
                    size_bytes=destination.stat().st_size,
                )
            )

        if not saved_files:
            raise HTTPException(status_code=400, detail="没有可保存的有效文件")

        return UploadDocumentsResponse(
            success=True,
            message=f"成功上传 {len(saved_files)} 个文件",
            target_directory=batch_name,
            files=saved_files,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 上传文档失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for upload in files:
            await upload.close()


@router.post("/index/{name}/update", response_model=IndexInfo)
async def update_index(name: str, request: UpdateIndexRequest):
    """
    向已有索引增量添加文档
    """
    try:
        if not index_manager.index_exists(name):
            raise HTTPException(status_code=404, detail=f"索引不存在: {name}")

        source_directory = _resolve_source_directory(
            directory_path=request.directory_path,
            uploaded_subdir=request.uploaded_subdir,
        )
        if not source_directory.exists():
            raise HTTPException(status_code=404, detail=f"目录不存在: {source_directory}")

        logger.info(f"📂 增量更新索引 {name}: {source_directory}")
        documents = load_directory(str(source_directory))
        if not documents:
            raise HTTPException(status_code=400, detail="目录中没有找到支持的文档")

        chunks = split_documents(
            documents,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
        )
        embeddings = get_embeddings()
        index_manager.update_index(name=name, documents=chunks, embeddings=embeddings)
        index_info = index_manager.get_index_info(name)
        return IndexInfo(**index_info)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 更新索引失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 查询接口 ====================

@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """
    RAG 查询（非流式）
    
    基于索引内容回答问题。
    
    Example:
        ```bash
        curl -X POST "http://localhost:8000/rag/query" \\
          -H "Content-Type: application/json" \\
          -d '{
            "index_name": "my_docs",
            "query": "什么是机器学习？",
            "k": 4
          }'
        ```
    """
    try:
        logger.info(f"🔍 RAG 查询: {request.query[:50]}...")
        
        # 检查索引是否存在
        if not index_manager.index_exists(request.index_name):
            raise HTTPException(
                status_code=404,
                detail=f"索引不存在: {request.index_name}"
            )
        
        # 加载索引
        embeddings = get_embeddings()
        vector_store = index_manager.load_index(request.index_name, embeddings)
        
        # 创建检索器
        retriever = create_retriever(vector_store, k=request.k)
        
        # 创建 RAG Agent
        agent = create_rag_agent(retriever)
        
        # 查询
        result = query_rag_agent(
            agent,
            request.query,
            return_sources=request.return_sources,
        )
        
        logger.info("✅ 查询完成")
        
        return QueryResponse(
            answer=result["answer"],
            sources=result.get("sources", []),
            retrieved_documents=[
                {
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                }
                for doc in result.get("retrieved_documents", [])
            ],
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 查询失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query/stream")
async def query_stream(request: QueryRequest):
    """
    RAG 查询（流式）
    
    使用 Server-Sent Events (SSE) 返回流式响应。
    
    Example:
        ```bash
        curl -X POST "http://localhost:8000/rag/query/stream" \\
          -H "Content-Type: application/json" \\
          -d '{
            "index_name": "my_docs",
            "query": "什么是机器学习？"
          }'
        ```
    """
    try:
        logger.info(f"🔍 RAG 流式查询: {request.query[:50]}...")
        
        # 检查索引是否存在
        if not index_manager.index_exists(request.index_name):
            raise HTTPException(
                status_code=404,
                detail=f"索引不存在: {request.index_name}"
            )
        
        # 加载索引
        embeddings = get_embeddings()
        vector_store = index_manager.load_index(request.index_name, embeddings)
        
        # 创建检索器
        retriever = create_retriever(vector_store, k=request.k)
        
        # 创建 RAG Agent
        agent = create_rag_agent(retriever, streaming=True)
        
        # 流式生成器
        async def event_generator():
            try:
                # 流式执行 - 使用字典输入
                async for chunk in agent.astream({"messages": [{"role": "user", "content": request.query}]}):
                    # 提取内容
                    if isinstance(chunk, dict) and "messages" in chunk:
                        messages = chunk["messages"]
                        if messages:
                            content = messages[-1].content if hasattr(messages[-1], 'content') else str(messages[-1])
                        else:
                            content = str(chunk)
                    else:
                        content = str(chunk)
                    
                    # 输出内容
                    data = {
                        "type": "content",
                        "content": content,
                    }
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                
                # 发送完成信号
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                
            except Exception as e:
                logger.error(f"❌ 流式查询错误: {e}")
                error_data = {
                    "type": "error",
                    "error": str(e),
                }
                yield f"data: {json.dumps(error_data)}\n\n"
        
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 流式查询失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=List[SearchResult])
async def search(request: SearchRequest):
    """
    纯检索（不生成回答）
    
    只返回相关文档，不使用 LLM 生成回答。
    
    Example:
        ```bash
        curl -X POST "http://localhost:8000/rag/search" \\
          -H "Content-Type: application/json" \\
          -d '{
            "index_name": "my_docs",
            "query": "机器学习",
            "k": 3
          }'
        ```
    """
    try:
        logger.info(f"🔍 检索: {request.query[:50]}...")
        
        # 检查索引是否存在
        if not index_manager.index_exists(request.index_name):
            raise HTTPException(
                status_code=404,
                detail=f"索引不存在: {request.index_name}"
            )
        
        # 加载索引
        embeddings = get_embeddings()
        vector_store = index_manager.load_index(request.index_name, embeddings)
        
        # 执行检索
        from rag.vector_stores import search_vector_store
        results = search_vector_store(
            vector_store,
            request.query,
            k=request.k,
            score_threshold=request.score_threshold,
        )
        
        logger.info(f"✅ 找到 {len(results)} 个文档")
        
        return [
            SearchResult(
                content=doc.page_content,
                metadata=doc.metadata,
                score=score,
            )
            for doc, score in results
        ]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 检索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 健康检查 ====================

@router.get("/health")
async def health_check():
    """
    健康检查
    
    Example:
        ```bash
        curl "http://localhost:8000/rag/health"
        ```
    """
    return {
        "status": "healthy",
        "indexes_count": len(index_manager.list_indexes()),
        "base_path": str(index_manager.base_path),
    }

