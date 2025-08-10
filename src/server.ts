/**
 * Paper Search MCP Server - Node.js Implementation
 * 支持多个学术平台的论文搜索和下载，包括 Web of Science
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  InitializeRequestSchema,
  PingRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { ArxivSearcher } from './platforms/ArxivSearcher.js';
import { WebOfScienceSearcher } from './platforms/WebOfScienceSearcher.js';
import { PubMedSearcher } from './platforms/PubMedSearcher.js';
import { BioRxivSearcher, MedRxivSearcher } from './platforms/BioRxivSearcher.js';
import { SemanticScholarSearcher } from './platforms/SemanticScholarSearcher.js';
import { IACRSearcher } from './platforms/IACRSearcher.js';
import { GoogleScholarSearcher } from './platforms/GoogleScholarSearcher.js';
import { PaperFactory, Paper } from './models/Paper.js';
import { PaperSource } from './platforms/PaperSource.js';

// 加载环境变量
dotenv.config();

// 创建MCP服务器实例
const server = new Server({
  name: 'paper-search-mcp-nodejs',
  version: '0.1.0'
}, {
  capabilities: {
    tools: {
      listChanged: true
    }
  }
});

// 延迟初始化搜索器实例，避免阻塞服务器启动
let searchers: {
  arxiv: ArxivSearcher;
  webofscience: WebOfScienceSearcher;
  pubmed: PubMedSearcher;
  wos: WebOfScienceSearcher;
  biorxiv: BioRxivSearcher;
  medrxiv: MedRxivSearcher;
  semantic: SemanticScholarSearcher;
  iacr: IACRSearcher;
  googlescholar: GoogleScholarSearcher;
  scholar: GoogleScholarSearcher;
} | null = null;

const initializeSearchers = () => {
  if (searchers) return searchers;
  
  console.error('🔧 Initializing searchers...');
  
  const arxivSearcher = new ArxivSearcher();
  const wosSearcher = new WebOfScienceSearcher(
    process.env.WOS_API_KEY,
    process.env.WOS_API_VERSION || 'v1'
  );
  const pubmedSearcher = new PubMedSearcher(process.env.PUBMED_API_KEY);
  const biorxivSearcher = new BioRxivSearcher('biorxiv');
  const medrxivSearcher = new MedRxivSearcher();
  const semanticSearcher = new SemanticScholarSearcher(process.env.SEMANTIC_SCHOLAR_API_KEY);
  const iacrSearcher = new IACRSearcher();
  const googleScholarSearcher = new GoogleScholarSearcher();

  searchers = {
    arxiv: arxivSearcher,
    webofscience: wosSearcher,
    pubmed: pubmedSearcher,
    wos: wosSearcher, // 别名
    biorxiv: biorxivSearcher,
    medrxiv: medrxivSearcher,
    semantic: semanticSearcher,
    iacr: iacrSearcher,
    googlescholar: googleScholarSearcher,
    scholar: googleScholarSearcher // 别名
  };
  
  console.error('✅ Searchers initialized successfully');
  return searchers;
};

// 工具参数类型定义
interface SearchPapersParams {
  query: string;
  platform?: 'arxiv' | 'webofscience' | 'pubmed' | 'wos' | 'biorxiv' | 'medrxiv' | 'semantic' | 'iacr' | 'googlescholar' | 'scholar' | 'all';
  maxResults?: number;
  year?: string;
  author?: string;
  journal?: string;
  category?: string;
  sortBy?: 'relevance' | 'date' | 'citations';
  sortOrder?: 'asc' | 'desc';
  days?: number; // bioRxiv/medRxiv
  fetchDetails?: boolean; // IACR
  fieldsOfStudy?: string[]; // Semantic Scholar
}

interface SearchArxivParams {
  query: string;
  maxResults?: number;
  category?: string;
  author?: string;
}

interface SearchWebOfScienceParams {
  query: string;
  maxResults?: number;
  year?: string;
  author?: string;
  journal?: string;
}

interface SearchPubMedParams {
  query: string;
  maxResults?: number;
  year?: string;
  author?: string;
  journal?: string;
  publicationType?: string[];
}

interface SearchBioRxivParams {
  query: string;
  maxResults?: number;
  days?: number;
}

interface SearchMedRxivParams {
  query: string;
  maxResults?: number;
  days?: number;
}

interface SearchSemanticScholarParams {
  query: string;
  maxResults?: number;
  year?: string;
  fieldsOfStudy?: string[];
}

interface SearchIACRParams {
  query: string;
  maxResults?: number;
  fetchDetails?: boolean;
}

interface DownloadPaperParams {
  paperId: string;
  platform: 'arxiv' | 'biorxiv' | 'medrxiv' | 'semantic' | 'iacr';
  savePath?: string;
}

interface GetPaperByDoiParams {
  doi: string;
  platform?: 'arxiv' | 'webofscience' | 'semantic' | 'all';
}

// 定义所有可用工具
const TOOLS: Tool[] = [
  {
    name: 'debug_pubmed_test',
    description: 'Debug PubMed search with detailed logging to bypass MCP cache',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { type: 'number', minimum: 1, maximum: 5, description: 'Maximum number of results' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_papers',
    description: 'Search academic papers from multiple sources including arXiv, Web of Science, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        platform: { 
          type: 'string', 
          enum: ['arxiv', 'webofscience', 'pubmed', 'wos', 'biorxiv', 'medrxiv', 'semantic', 'iacr', 'googlescholar', 'scholar', 'all'],
          description: 'Platform to search (arxiv, webofscience/wos, pubmed, biorxiv, medrxiv, semantic, iacr, googlescholar/scholar, or all)'
        },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 100,
          description: 'Maximum number of results to return'
        },
        year: { type: 'string', description: 'Year filter (e.g., "2023", "2020-2023", "2020-")' },
        author: { type: 'string', description: 'Author name filter' },
        journal: { type: 'string', description: 'Journal name filter' },
        category: { type: 'string', description: 'Category filter (e.g., cs.AI for arXiv)' },
        days: { 
          type: 'number', 
          description: 'Number of days to search back (bioRxiv/medRxiv only)'
        },
        fetchDetails: { 
          type: 'boolean', 
          description: 'Fetch detailed information (IACR only)'
        },
        fieldsOfStudy: { 
          type: 'array',
          items: { type: 'string' },
          description: 'Fields of study filter (Semantic Scholar only)'
        },
        sortBy: { 
          type: 'string', 
          enum: ['relevance', 'date', 'citations'],
          description: 'Sort results by relevance, date, or citations'
        },
        sortOrder: { 
          type: 'string', 
          enum: ['asc', 'desc'],
          description: 'Sort order: ascending or descending'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_arxiv',
    description: 'Search academic papers specifically from arXiv preprint server',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 50,
          description: 'Maximum number of results to return'
        },
        category: { type: 'string', description: 'arXiv category filter (e.g., cs.AI, physics.gen-ph)' },
        author: { type: 'string', description: 'Author name filter' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_webofscience',
    description: 'Search academic papers from Web of Science database',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 50,
          description: 'Maximum number of results to return'
        },
        year: { type: 'string', description: 'Publication year filter' },
        author: { type: 'string', description: 'Author name filter' },
        journal: { type: 'string', description: 'Journal name filter' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_pubmed',
    description: 'Search biomedical literature from PubMed/MEDLINE database using NCBI E-utilities API',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 100,
          description: 'Maximum number of results to return'
        },
        year: { type: 'string', description: 'Publication year filter (e.g., "2023", "2020-2023")' },
        author: { type: 'string', description: 'Author name filter' },
        journal: { type: 'string', description: 'Journal name filter' },
        publicationType: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Publication type filter (e.g., ["Journal Article", "Review"])'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_biorxiv',
    description: 'Search bioRxiv preprint server for biology papers',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 100,
          description: 'Maximum number of results to return'
        },
        days: { 
          type: 'number', 
          description: 'Number of days to search back (default: 30)' 
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_medrxiv',
    description: 'Search medRxiv preprint server for medical papers',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 100,
          description: 'Maximum number of results to return'
        },
        days: { 
          type: 'number', 
          description: 'Number of days to search back (default: 30)' 
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_semantic_scholar',
    description: 'Search Semantic Scholar for academic papers with citation data',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 100,
          description: 'Maximum number of results to return'
        },
        year: { type: 'string', description: 'Year filter (e.g., "2023", "2020-2023")' },
        fieldsOfStudy: { 
          type: 'array',
          items: { type: 'string' },
          description: 'Fields of study filter (e.g., ["Computer Science", "Biology"])'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_iacr',
    description: 'Search IACR ePrint Archive for cryptography papers',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 50,
          description: 'Maximum number of results to return'
        },
        fetchDetails: { 
          type: 'boolean', 
          description: 'Fetch detailed information for each paper (slower)' 
        }
      },
      required: ['query']
    }
  },
  {
    name: 'download_paper',
    description: 'Download PDF file of an academic paper',
    inputSchema: {
      type: 'object',
      properties: {
        paperId: { type: 'string', description: 'Paper ID (e.g., arXiv ID)' },
        platform: { type: 'string', enum: ['arxiv', 'biorxiv', 'medrxiv', 'semantic', 'iacr'], description: 'Platform where the paper is from' },
        savePath: { 
          type: 'string',
          description: 'Directory to save the PDF file'
        }
      },
      required: ['paperId', 'platform']
    }
  },
  {
    name: 'search_google_scholar',
    description: 'Search Google Scholar for academic papers using web scraping',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        maxResults: { 
          type: 'number', 
          minimum: 1, 
          maximum: 20,
          description: 'Maximum number of results to return'
        },
        yearLow: { 
          type: 'number', 
          description: 'Earliest publication year' 
        },
        yearHigh: { 
          type: 'number', 
          description: 'Latest publication year' 
        },
        author: { 
          type: 'string', 
          description: 'Author name filter' 
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_paper_by_doi',
    description: 'Retrieve paper information using DOI from available platforms',
    inputSchema: {
      type: 'object',
      properties: {
        doi: { type: 'string', description: 'DOI (Digital Object Identifier)' },
        platform: { 
          type: 'string', 
          enum: ['arxiv', 'webofscience', 'all'],
          description: 'Platform to search'
        }
      },
      required: ['doi']
    }
  },
  {
    name: 'get_platform_status',
    description: 'Check the status and capabilities of available academic platforms',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// 添加initialize请求处理器 - MCP协议的核心初始化
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  console.error('🤝 Received initialize request:', request.params);
  
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {
        listChanged: true
      }
    },
    serverInfo: {
      name: 'paper-search-mcp-nodejs',
      version: '0.1.0'
    }
  };
});

// 添加ping请求处理器 - 连接保活
server.setRequestHandler(PingRequestSchema, async () => {
  console.error('🏓 Received ping request');
  return {};
});

// 添加tools/list请求处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('🔧 Received tools/list request');
  return {
    tools: TOOLS
  };
});

// 添加tools/call请求处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`🔨 Received tools/call request: ${name}`);

  try {
    // 延迟初始化搜索器
    const currentSearchers = initializeSearchers();
    
    switch (name) {
      case 'debug_pubmed_test': {
        const params = args as unknown as { query: string; maxResults?: number };
        const { query, maxResults = 2 } = params;
        
        try {
          // 直接创建新的PubMed搜索器实例进行测试
          const testSearcher = new PubMedSearcher(process.env.PUBMED_API_KEY);
          const testResults = await testSearcher.search(query, { maxResults });
          
          return {
            content: [{
              type: 'text',
              text: `🧪 DEBUG PUBMED TEST 🧪\\nQuery: "${query}"\\nMaxResults: ${maxResults}\\nAPI Key: ${process.env.PUBMED_API_KEY ? 'SET' : 'NOT SET'}\\nResults: ${testResults.length}\\nFirst Title: ${testResults.length > 0 ? testResults[0].title : 'N/A'}\\n\\nFull Results:\\n${JSON.stringify(testResults.map(p => ({ title: p.title, paperId: p.paperId, authors: p.authors.slice(0, 2) })), null, 2)}`
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text',
              text: `🚨 DEBUG PUBMED ERROR 🚨\\nQuery: "${query}"\\nError: ${error.message}\\nStack: ${error.stack}`
            }]
          };
        }
      }

      case 'search_papers': {
        const params = args as unknown as SearchPapersParams;
        const { query, platform = 'all', maxResults = 10, year, author, sortBy = 'relevance', sortOrder = 'desc' } = params;
        const results = [];
        const searchOptions = { maxResults, year, author, sortBy, sortOrder };

        if (platform === 'all') {
          // 随机选择一个平台进行搜索
          const availablePlatforms = Object.keys(currentSearchers).filter(name => name !== 'wos' && name !== 'scholar'); // 跳过别名
          const randomPlatform = availablePlatforms[Math.floor(Math.random() * availablePlatforms.length)];
          
          console.error(`🎲 Randomly selected platform: ${randomPlatform}`);
          
          try {
            const searcher = currentSearchers[randomPlatform as keyof typeof currentSearchers];
            const platformResults = await (searcher as PaperSource).search(query, searchOptions);
            results.push(...platformResults.map((paper: Paper) => PaperFactory.toDict(paper)));
          } catch (error) {
            console.error(`Error searching random platform ${randomPlatform}:`, error);
            // 如果随机平台失败，尝试 arxiv 作为备选
            try {
              console.error('🔄 Fallback to arXiv platform');
              const platformResults = await currentSearchers.arxiv.search(query, searchOptions);
              results.push(...platformResults.map((paper: Paper) => PaperFactory.toDict(paper)));
            } catch (fallbackError) {
              console.error('Error with arxiv fallback:', fallbackError);
            }
          }
        } else {
          // 搜索指定平台
          const searcher = currentSearchers[platform as keyof typeof currentSearchers];
          if (!searcher) {
            throw new Error(`Unsupported platform: ${platform}`);
          }

          const platformResults = await (searcher as PaperSource).search(query, searchOptions);
          results.push(...platformResults.map((paper: Paper) => PaperFactory.toDict(paper)));
        }

        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} papers.\\n\\n${JSON.stringify(results, null, 2)}`
          }]
        };
      }

      case 'search_arxiv': {
        const params = args as unknown as SearchArxivParams;
        const { query, maxResults = 10, category, author } = params;
        
        const results = await currentSearchers.arxiv.search(query, { 
          maxResults, 
          category, 
          author 
        });

        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} arXiv papers.\\n\\n${JSON.stringify(
              results.map((paper: Paper) => PaperFactory.toDict(paper)), 
              null, 
              2
            )}`
          }]
        };
      }

      case 'search_webofscience': {
        const params = args as unknown as SearchWebOfScienceParams;
        const { query, maxResults = 10, year, author, journal } = params;
        
        if (!process.env.WOS_API_KEY) {
          throw new Error('Web of Science API key not configured. Please set WOS_API_KEY environment variable.');
        }

        const results = await currentSearchers.webofscience.search(query, { 
          maxResults, 
          year, 
          author, 
          journal 
        });

        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} Web of Science papers.\\n\\n${JSON.stringify(
              results.map((paper: Paper) => PaperFactory.toDict(paper)), 
              null, 
              2
            )}`
          }]
        };
      }

      case 'search_pubmed': {
        const params = args as unknown as SearchPubMedParams;
        const { query, maxResults = 10, year, author, journal, publicationType } = params;
        
        console.error(`🔍 MCP PubMed Search: query="${query}", maxResults=${maxResults}`);
        console.error(`📋 MCP PubMed Search options:`, { maxResults, year, author, journal, publicationType });
        console.error(`🔧 MCP PubMed Searcher type:`, typeof currentSearchers.pubmed);
        console.error(`🔧 MCP PubMed Searcher hasApiKey:`, currentSearchers.pubmed.hasApiKey());
        
        console.error(`⏳ MCP PubMed: About to call searcher.search()...`);
        const results = await currentSearchers.pubmed.search(query, { 
          maxResults, 
          year, 
          author, 
          journal,
          publicationType
        });
        console.error(`⚡ MCP PubMed: searcher.search() completed`);
        
        console.error(`📄 MCP PubMed Results: Found ${results.length} papers`);
        if (results.length > 0) {
          console.error(`📋 First paper title:`, results[0].title);
          console.error(`📋 First paper paperId:`, results[0].paperId);
        } else {
          console.error(`❌ MCP PubMed: No results returned from searcher`);
        }

        // 获取速率限制器状态信息
        const rateStatus = currentSearchers.pubmed.getRateLimiterStatus();
        const apiKeyStatus = currentSearchers.pubmed.hasApiKey() ? 'configured' : 'not configured';
        const rateLimit = currentSearchers.pubmed.hasApiKey() ? '10 requests/second' : '3 requests/second';

        // 创建详细的调试信息
        const debugInfo = {
          searchParams: { query, maxResults, year, author, journal, publicationType },
          searcherType: typeof currentSearchers.pubmed,
          hasApiKey: currentSearchers.pubmed.hasApiKey(),
          apiKeyStatus,
          rateLimit,
          rateLimiterStatus: rateStatus,
          resultCount: results.length,
          resultTypes: results.map(r => typeof r),
          firstResultTitle: results.length > 0 ? results[0].title : 'N/A'
        };

        return {
          content: [{
            type: 'text',
            text: `MCP DEBUG: query="${query}", searcher.hasApiKey()=${currentSearchers.pubmed.hasApiKey()}, typeof results=${typeof results}, results.length=${results.length}\\n\\nFound ${results.length} PubMed papers.\\n\\nAPI Status: ${apiKeyStatus} (${rateLimit})\\nRate Limiter: ${rateStatus.availableTokens}/${rateStatus.maxTokens} tokens available\\n\\n${JSON.stringify(
              results.map((paper: Paper) => PaperFactory.toDict(paper)), 
              null, 
              2
            )}`
          }]
        };
      }

      case 'search_biorxiv': {
        const params = args as unknown as SearchBioRxivParams;
        const { query, maxResults = 10, days } = params;
        
        const results = await currentSearchers.biorxiv.search(query, { 
          maxResults, 
          days 
        });

        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} bioRxiv papers.\\\\n\\\\n${JSON.stringify(
              results.map((paper: Paper) => PaperFactory.toDict(paper)), 
              null, 
              2
            )}`
          }]
        };
      }

      case 'search_medrxiv': {
        const params = args as unknown as SearchMedRxivParams;
        const { query, maxResults = 10, days } = params;
        
        const results = await currentSearchers.medrxiv.search(query, { 
          maxResults, 
          days 
        });

        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} medRxiv papers.\\\\n\\\\n${JSON.stringify(
              results.map((paper: Paper) => PaperFactory.toDict(paper)), 
              null, 
              2
            )}`
          }]
        };
      }

      case 'search_semantic_scholar': {
        const params = args as unknown as SearchSemanticScholarParams;
        const { query, maxResults = 10, year, fieldsOfStudy } = params;
        
        const results = await currentSearchers.semantic.search(query, { 
          maxResults, 
          year, 
          fieldsOfStudy 
        });

        // 获取速率限制器状态信息
        const rateStatus = (currentSearchers.semantic as any).getRateLimiterStatus();
        const apiKeyStatus = currentSearchers.semantic.hasApiKey() ? 'configured' : 'not configured (using free tier)';
        const rateLimit = currentSearchers.semantic.hasApiKey() ? '200 requests/minute' : '20 requests/minute';

        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} Semantic Scholar papers.\\\\n\\\\nAPI Status: ${apiKeyStatus} (${rateLimit})\\\\nRate Limiter: ${rateStatus.availableTokens}/${rateStatus.maxTokens} tokens available\\\\n\\\\n${JSON.stringify(
              results.map((paper: Paper) => PaperFactory.toDict(paper)), 
              null, 
              2
            )}`
          }]
        };
      }

      case 'search_iacr': {
        const params = args as unknown as SearchIACRParams;
        const { query, maxResults = 10, fetchDetails } = params;
        
        const results = await currentSearchers.iacr.search(query, { 
          maxResults, 
          fetchDetails 
        });

        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} IACR ePrint papers.\\\\n\\\\n${JSON.stringify(
              results.map((paper: Paper) => PaperFactory.toDict(paper)), 
              null, 
              2
            )}`
          }]
        };
      }

      case 'download_paper': {
        const params = args as unknown as DownloadPaperParams;
        const { paperId, platform, savePath = './downloads' } = params;
        
        const searcher = currentSearchers[platform as keyof typeof currentSearchers];
        if (!searcher) {
          throw new Error(`Unsupported platform for download: ${platform}`);
        }

        if (!searcher.getCapabilities().download) {
          throw new Error(`Platform ${platform} does not support PDF download`);
        }

        const filePath = await searcher.downloadPdf(paperId, { savePath });

        return {
          content: [{
            type: 'text',
            text: `PDF downloaded successfully to: ${filePath}`
          }]
        };
      }

      case 'search_google_scholar': {
        const params = args as unknown as { 
          query: string; 
          maxResults?: number; 
          yearLow?: number; 
          yearHigh?: number; 
          author?: string; 
        };
        const { query, maxResults = 10, yearLow, yearHigh, author } = params;
        
        console.error(`🔍 Google Scholar Search: query="${query}", maxResults=${maxResults}`);
        
        const results = await currentSearchers.googlescholar.search(query, { 
          maxResults, 
          yearLow, 
          yearHigh, 
          author 
        });
        
        console.error(`📄 Google Scholar Results: Found ${results.length} papers`);
        
        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} Google Scholar papers.\\n\\n${JSON.stringify(
              results.map((paper: Paper) => PaperFactory.toDict(paper)), 
              null, 
              2
            )}`
          }]
        };
      }

      case 'get_paper_by_doi': {
        const params = args as unknown as GetPaperByDoiParams;
        const { doi, platform = 'all' } = params;
        const results = [];

        if (platform === 'all') {
          // 尝试所有平台
          for (const [platformName, searcher] of Object.entries(currentSearchers)) {
            if (platformName === 'wos') continue; // 跳过别名
            
            try {
              const paper = await (searcher as PaperSource).getPaperByDoi(doi);
              if (paper) {
                results.push(PaperFactory.toDict(paper));
              }
            } catch (error) {
              console.error(`Error getting paper by DOI from ${platformName}:`, error);
            }
          }
        } else {
          // 指定平台
          const searcher = currentSearchers[platform as keyof typeof currentSearchers];
          if (!searcher) {
            throw new Error(`Unsupported platform: ${platform}`);
          }

          const paper = await searcher.getPaperByDoi(doi);
          if (paper) {
            results.push(PaperFactory.toDict(paper));
          }
        }

        if (results.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `No paper found with DOI: ${doi}`
            }]
          };
        }

        return {
          content: [{
            type: 'text',
            text: `Found ${results.length} paper(s) with DOI ${doi}:\\n\\n${JSON.stringify(results, null, 2)}`
          }]
        };
      }

      case 'get_platform_status': {
        const statusInfo = [];

        for (const [platformName, searcher] of Object.entries(currentSearchers)) {
          if (platformName === 'wos') continue; // 跳过别名

          const capabilities = (searcher as PaperSource).getCapabilities();
          const hasApiKey = (searcher as PaperSource).hasApiKey();
          
          let apiKeyStatus = 'not_required';
          if (capabilities.requiresApiKey) {
            if (hasApiKey) {
              // 验证API密钥
              const isValid = await (searcher as PaperSource).validateApiKey();
              apiKeyStatus = isValid ? 'valid' : 'invalid';
            } else {
              apiKeyStatus = 'missing';
            }
          }

          statusInfo.push({
            platform: platformName,
            baseUrl: (searcher as PaperSource).getBaseUrl(),
            capabilities: capabilities,
            apiKeyStatus: apiKeyStatus
          });
        }

        return {
          content: [{
            type: 'text',
            text: `Platform Status:\\n\\n${JSON.stringify(statusInfo, null, 2)}`
          }]
        };
      }

      default:
        console.error(`Unknown tool requested: ${name}`);
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    console.error(`Error in tool ${name}:`, error);
    return {
      content: [{
        type: 'text',
        text: `Error executing tool '${name}': ${error.message || 'Unknown error occurred'}`
      }],
      isError: true
    };
  }
});

/**
 * 启动服务器
 */
async function main() {
  try {
    console.error('🚀 Starting Paper Search MCP Server (Node.js)...');
    console.error(`📍 Working directory: ${process.cwd()}`);
    console.error(`📦 Node.js version: ${process.version}`);
    console.error(`🔧 Process arguments:`, process.argv);
    
    // 连接到标准输入输出传输
    const transport = new StdioServerTransport();
    
    console.error('📡 Connecting to stdio transport...');
    await server.connect(transport);
    
    console.error('✅ Paper Search MCP Server is running!');
    console.error('🔌 Ready to receive MCP protocol messages via stdio');
    
    // 注意：MCP服务器通过stdio通信，不监听网络端口
    console.error('ℹ️  Note: MCP servers communicate via stdio, not network ports');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// 处理未捕获的错误
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 启动服务器 - 直接调用main()确保服务器总是启动
main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});