/**
 * Paper Search MCP Server - Node.js Implementation
 * 支持多个学术平台的论文搜索和下载，包括 Web of Science
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { ArxivSearcher } from './platforms/ArxivSearcher.js';
import { WebOfScienceSearcher } from './platforms/WebOfScienceSearcher.js';
import { PaperFactory } from './models/Paper.js';

// 加载环境变量
dotenv.config();

// 创建MCP服务器实例
const server = new McpServer({
  name: 'paper-search-mcp-nodejs',
  version: '0.1.0'
});

// 初始化搜索器实例
const arxivSearcher = new ArxivSearcher();
const wosSearcher = new WebOfScienceSearcher(
  process.env.WOS_API_KEY,
  process.env.WOS_API_VERSION || 'v1'
);

// 搜索器映射
const searchers = {
  arxiv: arxivSearcher,
  webofscience: wosSearcher,
  wos: wosSearcher // 别名
};

/**
 * 通用搜索工具 - 支持所有平台
 */
server.registerTool(
  'search_papers',
  {
    title: 'Search Academic Papers',
    description: 'Search academic papers from multiple sources including arXiv, Web of Science, etc.',
    inputSchema: {
      query: z.string().describe('Search query string'),
      platform: z.enum(['arxiv', 'webofscience', 'wos', 'all']).default('all')
        .describe('Platform to search (arxiv, webofscience/wos, or all)'),
      maxResults: z.number().min(1).max(100).default(10)
        .describe('Maximum number of results to return'),
      year: z.string().optional()
        .describe('Year filter (e.g., "2023", "2020-2023", "2020-")'),
      author: z.string().optional()
        .describe('Author name filter'),
      sortBy: z.enum(['relevance', 'date', 'citations']).default('relevance')
        .describe('Sort results by relevance, date, or citations'),
      sortOrder: z.enum(['asc', 'desc']).default('desc')
        .describe('Sort order: ascending or descending')
    }
  },
  async ({ query, platform, maxResults, year, author, sortBy, sortOrder }) => {
    try {
      const results = [];
      const searchOptions = { maxResults, year, author, sortBy, sortOrder };

      if (platform === 'all') {
        // 搜索所有平台
        for (const [platformName, searcher] of Object.entries(searchers)) {
          if (platformName === 'wos') continue; // 跳过别名
          
          try {
            const platformResults = await searcher.search(query, searchOptions);
            results.push(...platformResults.map(paper => PaperFactory.toDict(paper)));
          } catch (error) {
            console.error(`Error searching ${platformName}:`, error);
            // 继续搜索其他平台
          }
        }
      } else {
        // 搜索指定平台
        const searcher = searchers[platform as keyof typeof searchers];
        if (!searcher) {
          throw new Error(`Unsupported platform: ${platform}`);
        }

        const platformResults = await searcher.search(query, searchOptions);
        results.push(...platformResults.map(paper => PaperFactory.toDict(paper)));
      }

      return {
        content: [{
          type: 'text',
          text: `Found ${results.length} papers.\n\n${JSON.stringify(results, null, 2)}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error searching papers: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * arXiv 专用搜索工具
 */
server.registerTool(
  'search_arxiv',
  {
    title: 'Search arXiv Papers',
    description: 'Search academic papers specifically from arXiv preprint server',
    inputSchema: {
      query: z.string().describe('Search query string'),
      maxResults: z.number().min(1).max(50).default(10)
        .describe('Maximum number of results to return'),
      category: z.string().optional()
        .describe('arXiv category filter (e.g., cs.AI, physics.gen-ph)'),
      author: z.string().optional()
        .describe('Author name filter')
    }
  },
  async ({ query, maxResults, category, author }) => {
    try {
      const results = await arxivSearcher.search(query, { 
        maxResults, 
        category, 
        author 
      });

      return {
        content: [{
          type: 'text',
          text: `Found ${results.length} arXiv papers.\n\n${JSON.stringify(
            results.map(paper => PaperFactory.toDict(paper)), 
            null, 
            2
          )}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error searching arXiv: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * Web of Science 专用搜索工具
 */
server.registerTool(
  'search_webofscience',
  {
    title: 'Search Web of Science',
    description: 'Search academic papers from Web of Science database',
    inputSchema: {
      query: z.string().describe('Search query string'),
      maxResults: z.number().min(1).max(50).default(10)
        .describe('Maximum number of results to return'),
      year: z.string().optional()
        .describe('Publication year filter'),
      author: z.string().optional()
        .describe('Author name filter'),
      journal: z.string().optional()
        .describe('Journal name filter')
    }
  },
  async ({ query, maxResults, year, author, journal }) => {
    try {
      if (!process.env.WOS_API_KEY) {
        throw new Error('Web of Science API key not configured. Please set WOS_API_KEY environment variable.');
      }

      const results = await wosSearcher.search(query, { 
        maxResults, 
        year, 
        author, 
        journal 
      });

      return {
        content: [{
          type: 'text',
          text: `Found ${results.length} Web of Science papers.\n\n${JSON.stringify(
            results.map(paper => PaperFactory.toDict(paper)), 
            null, 
            2
          )}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error searching Web of Science: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * PDF下载工具
 */
server.registerTool(
  'download_paper',
  {
    title: 'Download Paper PDF',
    description: 'Download PDF file of an academic paper',
    inputSchema: {
      paperId: z.string().describe('Paper ID (e.g., arXiv ID)'),
      platform: z.enum(['arxiv']).describe('Platform where the paper is from'),
      savePath: z.string().default('./downloads')
        .describe('Directory to save the PDF file')
    }
  },
  async ({ paperId, platform, savePath }) => {
    try {
      const searcher = searchers[platform as keyof typeof searchers];
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
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error downloading PDF: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * 根据DOI获取论文信息
 */
server.registerTool(
  'get_paper_by_doi',
  {
    title: 'Get Paper by DOI',
    description: 'Retrieve paper information using DOI from available platforms',
    inputSchema: {
      doi: z.string().describe('DOI (Digital Object Identifier)'),
      platform: z.enum(['arxiv', 'webofscience', 'all']).default('all')
        .describe('Platform to search')
    }
  },
  async ({ doi, platform }) => {
    try {
      const results = [];

      if (platform === 'all') {
        // 尝试所有平台
        for (const [platformName, searcher] of Object.entries(searchers)) {
          if (platformName === 'wos') continue; // 跳过别名
          
          try {
            const paper = await searcher.getPaperByDoi(doi);
            if (paper) {
              results.push(PaperFactory.toDict(paper));
            }
          } catch (error) {
            console.error(`Error getting paper by DOI from ${platformName}:`, error);
          }
        }
      } else {
        // 指定平台
        const searcher = searchers[platform as keyof typeof searchers];
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
          text: `Found ${results.length} paper(s) with DOI ${doi}:\n\n${JSON.stringify(results, null, 2)}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error getting paper by DOI: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * 获取平台状态和能力信息
 */
server.registerTool(
  'get_platform_status',
  {
    title: 'Get Platform Status',
    description: 'Check the status and capabilities of available academic platforms',
    inputSchema: {}
  },
  async () => {
    try {
      const statusInfo = [];

      for (const [platformName, searcher] of Object.entries(searchers)) {
        if (platformName === 'wos') continue; // 跳过别名

        const capabilities = searcher.getCapabilities();
        const hasApiKey = searcher.hasApiKey();
        
        let apiKeyStatus = 'not_required';
        if (capabilities.requiresApiKey) {
          if (hasApiKey) {
            // 验证API密钥
            const isValid = await searcher.validateApiKey();
            apiKeyStatus = isValid ? 'valid' : 'invalid';
          } else {
            apiKeyStatus = 'missing';
          }
        }

        statusInfo.push({
          platform: platformName,
          baseUrl: searcher.getBaseUrl(),
          capabilities: capabilities,
          apiKeyStatus: apiKeyStatus
        });
      }

      return {
        content: [{
          type: 'text',
          text: `Platform Status:\n\n${JSON.stringify(statusInfo, null, 2)}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error getting platform status: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

/**
 * 启动服务器
 */
async function main() {
  try {
    console.log('Starting Paper Search MCP Server (Node.js)...');
    
    // 连接到标准输入输出传输
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.log('Paper Search MCP Server is running...');
  } catch (error) {
    console.error('Failed to start server:', error);
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

// 启动服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}