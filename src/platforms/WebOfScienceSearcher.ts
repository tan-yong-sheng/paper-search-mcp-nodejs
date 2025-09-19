/**
 * Web of Science API集成模块
 * 支持 Web of Science Starter API 和 Web of Science Researcher API
 */

import axios, { AxiosResponse } from 'axios';
import { Paper, PaperFactory } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';

interface WoSSearchOptions extends SearchOptions {
  /** 数据库选择 */
  databases?: string[];
  /** 文档类型 */
  documentTypes?: string[];
  /** 语言过滤 */
  languages?: string[];
}

interface WoSApiResponse {
  metadata: {
    total: number;
    page: number;
    limit: number;
  };
  hits: WoSRecord[];
}

interface WoSRecord {
  /** 唯一标识符 */
  uid: string;
  /** 标题 */
  title: string;
  /** 文档类型 */
  types: string[];
  /** 来源类型 */
  sourceTypes: string[];
  /** 来源信息 */
  source: {
    sourceTitle: string;
    publishYear: number;
    publishMonth?: string;
    volume?: string;
    issue?: string;
    pages?: string;
  };
  /** 作者信息 */
  names?: {
    authors?: Array<{
      displayName: string;
    }>;
  };
  /** 摘要 */
  abstract?: string;
  /** DOI */
  identifiers?: {
    doi?: string;
  };
  /** 关键词 */
  keywords?: {
    authorKeywords?: string[];
  };
  /** 被引次数 */
  citations?: Array<{
    citingArticlesCount?: number;
  }>;
}

export class WebOfScienceSearcher extends PaperSource {
  private readonly apiUrl: string;
  private readonly apiVersion: string;

  constructor(apiKey?: string, apiVersion: string = 'v1') {
    super('webofscience', 'https://api.clarivate.com/apis', apiKey);
    this.apiVersion = apiVersion;
    this.apiUrl = `${this.baseUrl}/wos-starter/${this.apiVersion}`;
    // 只在开发模式下输出调试信息
    if (process.env.NODE_ENV === 'development') {
      console.error(`🔧 WoS API URL: ${this.apiUrl}`);
    }
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: false, // WoS 通常不提供直接PDF下载
      fullText: false, // 通常只有元数据
      citations: true,
      requiresApiKey: true,
      supportedOptions: ['maxResults', 'year', 'author', 'journal', 'sortBy', 'sortOrder']
    };
  }

  /**
   * 搜索Web of Science论文
   */
  async search(query: string, options: WoSSearchOptions = {}): Promise<Paper[]> {
    if (!this.apiKey) {
      throw new Error('Web of Science API key is required');
    }

    try {
      const searchParams = this.buildSearchQuery(query, options);
      const response = await this.makeApiRequest('/documents', {
        method: 'GET',
        params: searchParams
      });

      return this.parseSearchResponse(response.data);
    } catch (error) {
      this.handleHttpError(error, 'search');
    }
  }

  /**
   * Web of Science 通常不支持直接PDF下载
   */
  async downloadPdf(paperId: string, options?: DownloadOptions): Promise<string> {
    throw new Error('Web of Science does not support direct PDF download. Please use the DOI or URL to access the paper through the publisher.');
  }

  /**
   * Web of Science 通常不提供全文内容
   */
  async readPaper(paperId: string, options?: DownloadOptions): Promise<string> {
    throw new Error('Web of Science does not provide full-text content. Only bibliographic metadata and abstracts are available.');
  }

  /**
   * 根据DOI获取论文详细信息
   */
  async getPaperByDoi(doi: string): Promise<Paper | null> {
    try {
      const query = `DO="${doi}"`;
      const results = await this.search(query, { maxResults: 1 });
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Error getting paper by DOI from Web of Science:', error);
      return null;
    }
  }

  /**
   * 获取论文被引统计
   */
  async getCitationCount(paperId: string): Promise<number> {
    if (!this.apiKey) {
      throw new Error('Web of Science API key is required');
    }

    try {
      const response = await this.makeApiRequest(`/documents/${paperId}`, {
        method: 'GET'
      });

      const record = response.data?.Data?.[0];
      const citationData = record?.dynamic_data?.citation_related?.tc_list?.silo_tc;
      
      return citationData ? parseInt(citationData.local_count, 10) : 0;
    } catch (error) {
      console.error('Error getting citation count:', error);
      return 0;
    }
  }

  /**
   * 构建搜索查询参数
   */
  private buildSearchQuery(query: string, options: WoSSearchOptions): Record<string, any> {
    // 构建WOS查询字符串 - 支持多主题和复杂查询
    let formattedQuery = this.buildWosQuery(query, options);

    const params: Record<string, any> = {
      q: formattedQuery,
      db: options.databases?.join(',') || 'WOS',
      limit: Math.min(options.maxResults || 10, 100), // WOS API限制最大100条
      page: 1
    };

    // 添加排序参数 - 使用正确的API参数名
    if (options.sortBy) {
      const sortField = this.mapSortField(options.sortBy);
      params.sortBy = sortField; // 修正参数名从sortField到sortBy

      // 添加排序顺序
      if (options.sortOrder) {
        params.sortOrder = options.sortOrder.toUpperCase(); // API要求大写: ASC 或 DESC
      }
    }

    return params;
  }

  /**
   * 构建WOS格式的查询字符串
   */
  private buildWosQuery(query: string, options: WoSSearchOptions): string {
    const queryParts: string[] = [];

    // 处理主题搜索 - 支持多个关键词
    if (query && query.trim()) {
      // 转义特殊字符并处理多主题搜索
      const escapedQuery = this.escapeWosQuery(query);

      // 检查是否已经包含WOS字段标签
      if (escapedQuery.includes('=')) {
        // 用户提供了带字段标签的查询
        queryParts.push(escapedQuery);
      } else {
        // 简单查询，使用TS(Topic)字段
        queryParts.push(`TS=(${escapedQuery})`);
      }
    }

    // 添加年份过滤
    if (options.year) {
      if (options.year.includes('-')) {
        // 年份范围 "2020-2023"
        const [startYear, endYear] = options.year.split('-');
        queryParts.push(`PY=(${startYear.trim()}-${endYear.trim()})`);
      } else {
        // 单个年份
        queryParts.push(`PY=${options.year}`);
      }
    }

    // 添加作者过滤
    if (options.author) {
      const escapedAuthor = this.escapeWosQuery(options.author);
      queryParts.push(`AU=(${escapedAuthor})`);
    }

    // 添加期刊过滤
    if (options.journal) {
      const escapedJournal = this.escapeWosQuery(options.journal);
      queryParts.push(`SO=(${escapedJournal})`);
    }

    // 用AND连接所有查询部分
    return queryParts.join(' AND ');
  }

  /**
   * 转义WOS查询中的特殊字符
   */
  private escapeWosQuery(query: string): string {
    if (!query) return '';

    // 移除多余的引号和转义特殊字符
    return query
      .replace(/"/g, '') // 移除引号
      .replace(/[\(\)]/g, '') // 移除括号(API会自动添加)
      .trim();
  }

  /**
   * 映射排序字段到WOS API格式
   */
  private mapSortField(sortBy: string): string {
    const fieldMap: Record<string, string> = {
      'relevance': 'relevance',
      'date': 'PD', // Publication Date - 更准确的日期排序字段
      'citations': 'TC', // Times Cited
      'title': 'TI', // Title
      'author': 'AU', // Author
      'journal': 'SO' // Source (Journal)
    };
    return fieldMap[sortBy.toLowerCase()] || 'relevance';
  }

  /**
   * 解析搜索响应
   */
  private parseSearchResponse(data: WoSApiResponse): Paper[] {
    if (!data.hits || !Array.isArray(data.hits)) {
      console.error('❌ WoS: No hits found in response or hits is not an array');
      return [];
    }

    console.error(`📊 WoS: Found ${data.hits.length} hits out of ${data.metadata?.total || 0} total`);
    return data.hits.map(record => this.parseWoSRecord(record))
      .filter(paper => paper !== null) as Paper[];
  }

  /**
   * 解析单个WoS记录
   */
  private parseWoSRecord(record: WoSRecord): Paper | null {
    try {
      // 提取基本信息
      const title = record.title || 'No title available';
      const authors = record.names?.authors?.map(author => author.displayName) || [];
      const abstractText = record.abstract || '';
      
      // 提取出版信息
      const year = record.source?.publishYear;
      const publishedDate = year ? new Date(year, 0, 1) : null;
      const journal = record.source?.sourceTitle || '';
      
      // 提取DOI
      const doi = record.identifiers?.doi || '';
      
      // 提取被引次数
      const citationCount = record.citations?.[0]?.citingArticlesCount || 0;
      
      // 提取关键词
      const keywords = record.keywords?.authorKeywords || [];
      
      // 构建URL
      const wosUrl = `https://www.webofscience.com/wos/woscc/full-record/${record.uid}`;

      return PaperFactory.create({
        paperId: record.uid,
        title: this.cleanText(title),
        authors: authors,
        abstract: this.cleanText(abstractText),
        doi: doi,
        publishedDate: publishedDate,
        pdfUrl: '', // WoS通常不提供直接PDF链接
        url: wosUrl,
        source: 'webofscience',
        categories: record.types || [],
        keywords: keywords,
        citationCount: citationCount,
        journal: journal,
        volume: record.source?.volume || undefined,
        issue: record.source?.issue || undefined,
        pages: record.source?.pages || undefined,
        year: year,
        extra: {
          uid: record.uid,
          doctype: record.types?.[0],
          sourceTypes: record.sourceTypes
        }
      });
    } catch (error) {
      console.error('Error parsing WoS record:', error);
      console.error('Record data:', record);
      return null;
    }
  }

  /**
   * 提取页码信息
   */
  private extractPages(pubInfo: any): string | undefined {
    if (!pubInfo?.page) return undefined;
    
    const beginPage = pubInfo.page['@begin'];
    const endPage = pubInfo.page['@end'];
    
    if (beginPage && endPage) {
      return `${beginPage}-${endPage}`;
    } else if (beginPage) {
      return beginPage;
    }
    
    return undefined;
  }

  /**
   * 发起API请求
   */
  private async makeApiRequest(endpoint: string, config: any): Promise<AxiosResponse> {
    const url = `${this.apiUrl}${endpoint}`;
    
    const requestConfig = {
      ...config,
      headers: {
        'X-ApiKey': this.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Paper-Search-MCP/1.0 (Academic Research Tool)',
        ...config.headers
      },
      timeout: 30000
    };

    // 调试日志 - 只在开发模式或详细日志模式下输出
    if (process.env.NODE_ENV === 'development' || process.env.WOS_VERBOSE_LOGGING === 'true') {
      console.error(`🔍 WoS API Request: ${config.method} ${url}`);
      console.error(`📋 WoS Request params:`, config.params);
    }
    
    try {
      const response = await axios(url, requestConfig);
      if (process.env.NODE_ENV === 'development' || process.env.WOS_VERBOSE_LOGGING === 'true') {
        console.error(`✅ WoS API Response: ${response.status} ${response.statusText}`);
        console.error(`📄 WoS Response data preview:`, JSON.stringify(response.data, null, 2).substring(0, 500));
      }
      return response;
    } catch (error: any) {
      console.error(`❌ WoS API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          params: error.config?.params
        }
      });
      throw error;
    }
  }

  /**
   * 验证API密钥
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      await this.search('test', { maxResults: 1 });
      return true;
    } catch (error: any) {
      // API密钥无效通常返回401或403
      if (error.response?.status === 401 || error.response?.status === 403) {
        return false;
      }
      // 其他错误可能是网络问题，认为密钥可能有效
      return true;
    }
  }
}