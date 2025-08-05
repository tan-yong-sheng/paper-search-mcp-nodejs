# Paper Search MCP (Node.js)

A Node.js implementation of the Model Context Protocol (MCP) server for searching and downloading academic papers from multiple sources, including **Web of Science**, arXiv, and more.

![Node.js](https://img.shields.io/badge/node.js->=18.0.0-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-^5.5.3-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Features

- **多平台支持**: arXiv, Web of Science, 以及更多学术数据库
- **Web of Science集成**: 支持Web of Science Starter和Researcher API
- **统一数据格式**: 标准化的论文数据模型，支持所有平台
- **MCP协议**: 与大语言模型（如Claude Desktop）无缝集成
- **TypeScript**: 完整的类型安全和现代JavaScript特性
- **异步处理**: 高效的并发搜索和下载
- **灵活配置**: 支持多种搜索选项和过滤器

## 📚 支持的平台

| 平台 | 搜索 | 下载 | 全文 | 被引统计 | API密钥 |
|------|------|------|------|----------|---------|
| **Web of Science** | ✅ | ❌ | ❌ | ✅ | ✅ 必需 |
| **arXiv** | ✅ | ✅ | ✅ | ❌ | ❌ |
| PubMed | 🚧 | 🚧 | 🚧 | 🚧 | 🚧 |
| Semantic Scholar | 🚧 | 🚧 | 🚧 | 🚧 | 🚧 |

✅ 已支持 | ❌ 不支持 | 🚧 开发中

## 🚀 快速开始

### 系统要求

- Node.js >= 18.0.0
- npm 或 yarn

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/paper-search-mcp-nodejs.git
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

2. **配置环境变量**
   ```bash
   # 编辑 .env 文件
   WOS_API_KEY=your_actual_api_key_here
   WOS_API_VERSION=v1
   ```

### 构建和运行

```bash
# 构建TypeScript代码
npm run build

# 运行服务器
npm start

# 或者在开发模式下运行
npm run dev
```

### 与Claude Desktop集成

在Claude Desktop配置文件中添加以下配置：

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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
// 搜索所有平台
search_papers({
  query: "machine learning",
  platform: "all",
  maxResults: 10,
  year: "2023",
  sortBy: "date"
})

// 搜索特定平台
search_papers({
  query: "quantum computing",
  platform: "webofscience",
  maxResults: 5
})
```

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

## 📞 支持

- 📧 Email: your.email@example.com
- 💬 Discussions: [GitHub Discussions](https://github.com/your-username/paper-search-mcp-nodejs/discussions)
- 📖 文档: [Wiki](https://github.com/your-username/paper-search-mcp-nodejs/wiki)

---

⭐ 如果这个项目对你有帮助，请给它一个星标！