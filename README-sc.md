# Paper Search MCP (Node.js)

##  中文|[English](README.md)
一个基于Node.js的模型上下文协议(MCP)服务器，用于搜索和下载多个学术数据库的论文，包括arXiv、Web of Science、PubMed、Google Scholar等**8个学术平台**。

![Node.js](https://img.shields.io/badge/node.js->=18.0.0-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-^5.5.3-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platforms](https://img.shields.io/badge/platforms-8-brightgreen.svg)

## ✨ 核心特性

- **🌍 8个学术平台**: arXiv, Web of Science, PubMed, Google Scholar, bioRxiv, medRxiv, Semantic Scholar, IACR ePrint
- **🔗 MCP协议集成**: 与Claude Desktop和其他AI助手无缝集成
- **📊 统一数据模型**: 标准化的论文数据格式，支持所有平台
- **⚡ 高性能搜索**: 并发搜索和智能速率限制
- **🛡️ 类型安全**: 完整的TypeScript支持
- **🎯 学术论文优先**: 智能过滤，优先显示学术论文而非书籍
- **🔄 智能错误处理**: 平台降级和自动重试机制

## 📚 支持的平台

| 平台 | 搜索 | 下载 | 全文 | 被引统计 | API密钥 | 特色功能 |
|------|------|------|------|----------|---------|----------|
| **arXiv** | ✅ | ✅ | ✅ | ❌ | ❌ | 物理/计算机科学预印本 |
| **Web of Science** | ✅ | ❌ | ❌ | ✅ | ✅ 必需 | 高质量期刊索引 |
| **PubMed** | ✅ | ❌ | ❌ | ❌ | 🟡 可选 | 生物医学文献 |
| **Google Scholar** | ✅ | ❌ | ❌ | ✅ | ❌ | 广泛学术搜索 |
| **bioRxiv** | ✅ | ✅ | ✅ | ❌ | ❌ | 生物学预印本 |
| **medRxiv** | ✅ | ✅ | ✅ | ❌ | ❌ | 医学预印本 |
| **Semantic Scholar** | ✅ | ✅ | ❌ | ✅ | 🟡 可选 | AI语义搜索 |
| **IACR ePrint** | ✅ | ✅ | ✅ | ❌ | ❌ | 密码学论文 |

✅ 已支持 | ❌ 不支持 | 🟡 可选

## 🚀 快速开始

### 系统要求

- Node.js >= 18.0.0
- npm 或 yarn

### 安装

```bash
# 克隆仓库
git clone https://github.com/Dianel555/paper-search-mcp-nodejs.git
cd paper-search-mcp-nodejs

# 安装依赖
npm install

# 复制环境变量模板
cp .env.example .env
```

### 配置

1. **获取Web of Science API密钥**
   - 访问 [Clarivate Developer Portal](https://developer.clarivate.com/apis)
   - 注册并申请Web of Science API访问权限
   - 将API密钥添加到 `.env` 文件

2. **获取PubMed API密钥（可选）**
   - 无API密钥：免费使用，限制每秒3次请求
   - 有API密钥：每秒10次请求，更稳定的服务
   - 获取密钥：参考 [NCBI API Keys](https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities/)

3. **配置环境变量**
   ```bash
   # 编辑 .env 文件
   WOS_API_KEY=your_actual_api_key_here
   WOS_API_VERSION=v1
   
   # PubMed API密钥（可选，建议配置以获得更好性能）
   PUBMED_API_KEY=your_ncbi_api_key_here
   
   # Semantic Scholar API密钥（可选，提升请求限制）
   SEMANTIC_SCHOLAR_API_KEY=your_semantic_scholar_api_key
   ```

### 构建和运行

#### 方法1: NPX部署 (推荐用于MCP)
```bash
# 使用npx直接运行 (最常见的MCP部署方式)
npx paper-search-mcp-nodejs

# 或全局安装
npm install -g paper-search-mcp-nodejs
paper-search-mcp
```

#### 方法2: 本地开发
```bash
# 构建TypeScript代码
npm run build

# 运行服务器
npm start

# 或者在开发模式下运行
npm run dev
```

### MCP服务器配置

在Claude Desktop配置文件中添加以下配置：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### NPX配置 (推荐)
```json
{
  "mcpServers": {
    "paper-search-nodejs": {
      "command": "npx",
      "args": ["paper-search-mcp-nodejs"],
      "env": {
        "WOS_API_KEY": "your_web_of_science_api_key"
      }
    }
  }
}
```

#### 本地安装配置
```json
{
  "mcpServers": {
    "paper_search_nodejs": {
      "command": "node",
      "args": ["/path/to/paper-search-mcp-nodejs/dist/server.js"],
      "env": {
        "WOS_API_KEY": "your_web_of_science_api_key"
      }
    }
  }
}
```

## 🛠️ MCP工具

### `search_papers`
搜索多个平台的学术论文

```typescript
// 随机平台选择（默认行为）
search_papers({
  query: "machine learning",
  platform: "all",      // 随机选择一个平台，提供高效聚焦的结果
  maxResults: 10,
  year: "2023",
  sortBy: "date"
})

// 搜索特定平台
search_papers({
  query: "quantum computing",
  platform: "webofscience",  // 指定特定平台
  maxResults: 5
})
```

**平台选择行为：**
- `platform: "all"` - 随机选择一个平台进行高效、聚焦的搜索
- 特定平台 - 仅搜索指定平台
- 可用平台: `arxiv`, `webofscience`/`wos`, `pubmed`, `biorxiv`, `medrxiv`, `semantic`, `iacr`, `googlescholar`/`scholar`

### `search_arxiv`
专门搜索arXiv预印本

```typescript
search_arxiv({
  query: "transformer neural networks",
  maxResults: 10,
  category: "cs.AI",
  author: "Attention"
})
```

### `search_webofscience`
专门搜索Web of Science数据库

```typescript
search_webofscience({
  query: "CRISPR gene editing",
  maxResults: 15,
  year: "2022",
  journal: "Nature"
})
```

### `search_pubmed`
专门搜索PubMed/MEDLINE生物医学文献数据库

```typescript
search_pubmed({
  query: "COVID-19 vaccine efficacy",
  maxResults: 20,
  year: "2023",
  author: "Smith",
  journal: "New England Journal of Medicine",
  publicationType: ["Journal Article", "Clinical Trial"]
})
```

### `search_google_scholar`
专门搜索Google Scholar学术数据库

```typescript
search_google_scholar({
  query: "machine learning",
  maxResults: 10,
  yearLow: 2020,
  yearHigh: 2023,
  author: "Bengio"
})
```

### `search_biorxiv` / `search_medrxiv`
搜索生物学和医学预印本

```typescript
search_biorxiv({
  query: "CRISPR",
  maxResults: 15,
  days: 30
})
```

### `search_semantic_scholar`
搜索Semantic Scholar AI语义数据库

```typescript
search_semantic_scholar({
  query: "deep learning",
  maxResults: 10,
  fieldsOfStudy: ["Computer Science"],
  year: "2023"
})
```

### `search_iacr`
搜索IACR ePrint密码学论文档案

```typescript
search_iacr({
  query: "zero knowledge proof",
  maxResults: 5,
  fetchDetails: true
})
```

### `download_paper`
下载论文PDF文件

```typescript
download_paper({
  paperId: "2106.12345",
  platform: "arxiv",
  savePath: "./downloads"
})
```

### `get_paper_by_doi`
通过DOI获取论文信息

```typescript
get_paper_by_doi({
  doi: "10.1038/s41586-023-12345-6",
  platform: "all"
})
```

### `get_platform_status`
检查平台状态和API密钥

```typescript
get_platform_status({})
```

## 📊 数据模型

所有平台的论文数据都转换为统一的格式：

```typescript
interface Paper {
  paperId: string;           // 唯一标识符
  title: string;            // 论文标题
  authors: string[];        // 作者列表
  abstract: string;         // 摘要
  doi: string;             // DOI
  publishedDate: Date;     // 发布日期
  pdfUrl: string;          // PDF链接
  url: string;             // 论文页面URL
  source: string;          // 来源平台
  citationCount?: number;   // 被引次数
  journal?: string;         // 期刊名称
  year?: number;           // 年份
  categories?: string[];    // 学科分类
  keywords?: string[];      // 关键词
  // ... 更多字段
}
```

## 🔧 开发

### 项目结构

```
src/
├── models/
│   └── Paper.ts              # 论文数据模型
├── platforms/
│   ├── PaperSource.ts        # 抽象基类
│   ├── ArxivSearcher.ts      # arXiv搜索器
│   └── WebOfScienceSearcher.ts # Web of Science搜索器
└── server.ts                 # MCP服务器主文件
```

### 添加新平台

1. 创建新的搜索器类继承 `PaperSource`
2. 实现必需的抽象方法
3. 在 `server.ts` 中注册新的搜索器
4. 添加相应的MCP工具

### 测试

```bash
# 运行测试
npm test

# 运行linting
npm run lint

# 代码格式化
npm run format
```

## 🌟 Web of Science 特性

### 支持的API

- **Web of Science Starter API**: 基础搜索和被引统计
- **Web of Science Researcher API**: 高级搜索和详细元数据

### 高级搜索语法

```typescript
// 使用Web of Science查询语法
search_webofscience({
  query: 'TS="machine learning" AND PY=2023',
  maxResults: 20
})

// 作者搜索
search_webofscience({
  query: 'AU="Smith, J*"',
  maxResults: 10
})

// 期刊搜索
search_webofscience({
  query: 'SO="Nature" AND PY=2022-2023',
  maxResults: 15
})
```

### 支持的字段

- `TS`: 主题搜索
- `AU`: 作者
- `SO`: 来源期刊
- `PY`: 发表年份
- `DO`: DOI
- `TI`: 标题

## 📝 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🤝 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与。

1. Fork项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开Pull Request

## 🐛 问题报告

如果遇到问题，请在 [GitHub Issues](https://github.com/your-username/paper-search-mcp-nodejs/issues) 中报告。

---

⭐ 如果这个项目对你有帮助，请给它一个星标！