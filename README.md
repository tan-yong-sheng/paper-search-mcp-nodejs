# Paper Search MCP (Node.js)

## English|[中文](README-sc.md)

A Node.js Model Context Protocol (MCP) server for searching and downloading academic papers from multiple sources, including arXiv, Web of Science, PubMed, Google Scholar, and **8 academic platforms** in total.

![Node.js](https://img.shields.io/badge/node.js->=18.0.0-green.svg)
![TypeScript](https://img.shields.io/badge/typescript-^5.5.3-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platforms](https://img.shields.io/badge/platforms-8-brightgreen.svg)

## ✨ Key Features

- **🌍 8 Academic Platforms**: arXiv, Web of Science, PubMed, Google Scholar, bioRxiv, medRxiv, Semantic Scholar, IACR ePrint
- **🔗 MCP Protocol Integration**: Seamless integration with Claude Desktop and other AI assistants
- **📊 Unified Data Model**: Standardized paper format across all platforms
- **⚡ High-Performance Search**: Concurrent search with intelligent rate limiting
- **🛡️ Type Safety**: Complete TypeScript support
- **🎯 Academic Papers First**: Smart filtering prioritizing academic papers over books
- **🔄 Smart Error Handling**: Platform fallback and auto-retry mechanisms

## 📚 Supported Platforms

| Platform | Search | Download | Full Text | Citations | API Key | Special Features |
|----------|--------|----------|-----------|-----------|---------|------------------|
| **arXiv** | ✅ | ✅ | ✅ | ❌ | ❌ | Physics/CS preprints |
| **Web of Science** | ✅ | ❌ | ❌ | ✅ | ✅ Required | High-quality journal index |
| **PubMed** | ✅ | ❌ | ❌ | ❌ | 🟡 Optional | Biomedical literature |
| **Google Scholar** | ✅ | ❌ | ❌ | ✅ | ❌ | Comprehensive academic search |
| **bioRxiv** | ✅ | ✅ | ✅ | ❌ | ❌ | Biology preprints |
| **medRxiv** | ✅ | ✅ | ✅ | ❌ | ❌ | Medical preprints |
| **Semantic Scholar** | ✅ | ✅ | ❌ | ✅ | 🟡 Optional | AI semantic search |
| **IACR ePrint** | ✅ | ✅ | ✅ | ❌ | ❌ | Cryptography papers |

✅ Supported | ❌ Not supported | 🟡 Optional

## 🚀 Quick Start

### System Requirements

- Node.js >= 18.0.0
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/paper-search-mcp-nodejs.git
cd paper-search-mcp-nodejs

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Configuration

1. **Get Web of Science API Key**
   - Visit [Clarivate Developer Portal](https://developer.clarivate.com/apis)
   - Register and apply for Web of Science API access
   - Add API key to `.env` file

2. **Get PubMed API Key (Optional)**
   - Without API key: Free usage, 3 requests/second limit
   - With API key: 10 requests/second, more stable service
   - Get key: See [NCBI API Keys](https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities/)

3. **Configure Environment Variables**
   ```bash
   # Edit .env file
   WOS_API_KEY=your_actual_api_key_here
   WOS_API_VERSION=v1
   
   # PubMed API key (optional, recommended for better performance)
   PUBMED_API_KEY=your_ncbi_api_key_here
   
   # Semantic Scholar API key (optional, increases rate limits)
   SEMANTIC_SCHOLAR_API_KEY=your_semantic_scholar_api_key
   ```

### Build and Run

#### Method 1: NPX (Recommended for MCP)
```bash
# Direct run with npx (most common MCP deployment)
npx paper-search-mcp-nodejs

# Or install globally
npm install -g paper-search-mcp-nodejs
paper-search-mcp
```

#### Method 2: Local Development
```bash
# Build TypeScript code
npm run build

# Start server
npm start

# Or run in development mode
npm run dev
```

### MCP Server Configuration

Add the following configuration to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### NPX Configuration (Recommended)
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

#### Local Installation Configuration
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

## 🛠️ MCP Tools

### `search_papers`
Search academic papers across multiple platforms

```typescript
// Random platform selection (default behavior)
search_papers({
  query: "machine learning",
  platform: "all",      // Randomly selects one platform for efficiency
  maxResults: 10,
  year: "2023",
  sortBy: "date"
})

// Search specific platform
search_papers({
  query: "quantum computing",
  platform: "webofscience",  // Target specific platform
  maxResults: 5
})
```

**Platform Selection Behavior:**
- `platform: "all"` - Randomly selects one platform for efficient, focused results
- Specific platform - Searches only that platform
- Available platforms: `arxiv`, `webofscience`/`wos`, `pubmed`, `biorxiv`, `medrxiv`, `semantic`, `iacr`, `googlescholar`/`scholar`

### `search_arxiv`
Search arXiv preprints specifically

```typescript
search_arxiv({
  query: "transformer neural networks",
  maxResults: 10,
  category: "cs.AI",
  author: "Attention"
})
```

### `search_webofscience`
Search Web of Science database specifically

```typescript
search_webofscience({
  query: "CRISPR gene editing",
  maxResults: 15,
  year: "2022",
  journal: "Nature"
})
```

### `search_pubmed`
Search PubMed/MEDLINE biomedical literature database

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
Search Google Scholar academic database

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
Search biology and medical preprints

```typescript
search_biorxiv({
  query: "CRISPR",
  maxResults: 15,
  days: 30
})
```

### `search_semantic_scholar`
Search Semantic Scholar AI semantic database

```typescript
search_semantic_scholar({
  query: "deep learning",
  maxResults: 10,
  fieldsOfStudy: ["Computer Science"],
  year: "2023"
})
```

### `search_iacr`
Search IACR ePrint cryptography archive

```typescript
search_iacr({
  query: "zero knowledge proof",
  maxResults: 5,
  fetchDetails: true
})
```

### `download_paper`
Download paper PDF files

```typescript
download_paper({
  paperId: "2106.12345",
  platform: "arxiv",
  savePath: "./downloads"
})
```

### `get_paper_by_doi`
Get paper information by DOI

```typescript
get_paper_by_doi({
  doi: "10.1038/s41586-023-12345-6",
  platform: "all"
})
```

### `get_platform_status`
Check platform status and API keys

```typescript
get_platform_status({})
```

## 📊 Data Model

All platform paper data is converted to a unified format:

```typescript
interface Paper {
  paperId: string;           // Unique identifier
  title: string;            // Paper title
  authors: string[];        // Author list
  abstract: string;         // Abstract
  doi: string;             // DOI
  publishedDate: Date;     // Publication date
  pdfUrl: string;          // PDF link
  url: string;             // Paper page URL
  source: string;          // Source platform
  citationCount?: number;   // Citation count
  journal?: string;         // Journal name
  year?: number;           // Publication year
  categories?: string[];    // Subject categories
  keywords?: string[];      // Keywords
  // ... more fields
}
```

## 🔧 Development

### Project Structure

```
src/
├── models/
│   └── Paper.ts              # Paper data model
├── platforms/
│   ├── PaperSource.ts        # Abstract base class
│   ├── ArxivSearcher.ts      # arXiv searcher
│   ├── WebOfScienceSearcher.ts # Web of Science searcher
│   ├── PubMedSearcher.ts     # PubMed searcher
│   ├── GoogleScholarSearcher.ts # Google Scholar searcher
│   ├── BioRxivSearcher.ts    # bioRxiv/medRxiv searcher
│   ├── SemanticScholarSearcher.ts # Semantic Scholar searcher
│   └── IACRSearcher.ts       # IACR ePrint searcher
├── utils/
│   └── RateLimiter.ts        # Token bucket rate limiter
└── server.ts                 # MCP server main file
```

### Adding New Platforms

1. Create new searcher class extending `PaperSource`
2. Implement required abstract methods
3. Register new searcher in `server.ts`
4. Add corresponding MCP tool

### Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Code formatting
npm run format
```

## 🌟 Platform-Specific Features

### Web of Science Advanced Search

```typescript
// Use Web of Science query syntax
search_webofscience({
  query: 'TS="machine learning" AND PY=2023',
  maxResults: 20
})

// Author search
search_webofscience({
  query: 'AU="Smith, J*"',
  maxResults: 10
})

// Journal search
search_webofscience({
  query: 'SO="Nature" AND PY=2022-2023',
  maxResults: 15
})
```

**Supported Fields:**
- `TS`: Topic search
- `AU`: Author
- `SO`: Source journal
- `PY`: Publication year
- `DO`: DOI
- `TI`: Title

### Google Scholar Features

- **Academic Paper Priority**: Automatically filters out books, prioritizes peer-reviewed papers
- **Citation Data**: Provides citation counts and academic metrics
- **Anti-Detection**: Smart request patterns to avoid blocking
- **Comprehensive Coverage**: Searches across all academic publishers

### Semantic Scholar Features

- **AI-Powered Search**: Semantic understanding of queries
- **Citation Networks**: Paper relationships and influence metrics
- **Open Access PDFs**: Direct links to freely available papers
- **Research Fields**: Filter by specific academic disciplines

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the project
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 🐛 Issue Reporting

If you encounter issues, please report them at [GitHub Issues](https://github.com/your-username/paper-search-mcp-nodejs/issues).

## 🙏 Acknowledgments

- Original [paper-search-mcp](https://github.com/openags/paper-search-mcp) for the foundation
- MCP community for the protocol standards

---

⭐ If this project helps you, please give it a star!