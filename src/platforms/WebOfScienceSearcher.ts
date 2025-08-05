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
  QueryResult: {
    RecordsFound: number;
    RecordsSearched: number;
    Records: WoSRecord[];
  };
}

interface WoSRecord {
  /** 唯一标识符 */
  UID: string;
  /** 标题信息 */
  static_data: {
    summary: {
      titles: {
        title: Array<{
          '#text': string;
          type: string;
        }>;
      };
      names: {
        name: Array<{
          display_name: string;
          role: string;
        }>;
      };
      pub_info: {
        '@pubyear': string;
        '@vol': string;
        '@issue': string;
        '@pubtype': string;
        page: {
          '@begin': string;
          '@end': string;
        };
        pub_title: {
          '#text': string;
        };
      };
      doctypes: {
        doctype: string;
      };
    };
    fullrecord_metadata: {
      abstracts?: {
        abstract: {
          abstract_text: {
            p: string;
          };
        };
      };
      category_info?: {
        headings: {
          heading: Array<{
            '#text': string;
          }>;
        };
        subheadings: {
          subheading: Array<{
            '#text': string;
          }>;
        };
      };
      keywords?: {
        keyword: Array<{
          '#text': string;
        }>;
      };
    };
  };
  /** 动态数据（引用等） */
  dynamic_data?: {
    citation_related: {
      tc_list: {
        silo_tc: {
          local_count: string;
        };
      };
    };
  };
}

export class WebOfScienceSearcher extends PaperSource {
  private readonly apiUrl: string;
  private readonly apiVersion: string;

  constructor(apiKey?: string, apiVersion: string = 'v1') {
    super('webofscience', 'https://api.clarivate.com/apis', apiKey);
    this.apiVersion = apiVersion;
    this.apiUrl = `${this.baseUrl}/wos-researcher/${this.apiVersion}`;
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
    const params: Record<string, any> = {
      databaseId: options.databases?.join(',') || 'WOS',
      usrQuery: query,
      count: options.maxResults || 10,
      firstRecord: 1
    };

    // 添加年份过滤
    if (options.year) {
      params.usrQuery += ` AND PY=${options.year}`;
    }

    // 添加作者过滤
    if (options.author) {
      params.usrQuery += ` AND AU="${options.author}"`;
    }

    // 添加期刊过滤
    if (options.journal) {
      params.usrQuery += ` AND SO="${options.journal}"`;
    }

    // 添加排序
    if (options.sortBy) {
      const sortField = this.mapSortField(options.sortBy);
      const sortOrder = options.sortOrder === 'asc' ? '+' : '-';
      params.sortField = `${sortOrder}${sortField}`;
    }

    return params;
  }

  /**
   * 映射排序字段
   */
  private mapSortField(sortBy: string): string {
    const fieldMap: Record<string, string> = {
      'relevance': 'relevance',
      'date': 'PY',
      'citations': 'TC'
    };
    return fieldMap[sortBy] || 'relevance';
  }

  /**
   * 解析搜索响应
   */
  private parseSearchResponse(data: WoSApiResponse): Paper[] {
    if (!data.QueryResult?.Records) {
      return [];
    }

    return data.QueryResult.Records.map(record => this.parseWoSRecord(record))
      .filter(paper => paper !== null) as Paper[];
  }

  /**
   * 解析单个WoS记录
   */
  private parseWoSRecord(record: WoSRecord): Paper | null {
    try {
      const summary = record.static_data.summary;
      const fullRecord = record.static_data.fullrecord_metadata;

      // 提取标题
      const titleObj = summary.titles?.title?.find(t => t.type === 'item') || summary.titles?.title?.[0];
      const title = titleObj?.['#text'] || 'No title available';

      // 提取作者
      const authors = summary.names?.name
        ?.filter(name => name.role === 'author')
        ?.map(name => name.display_name) || [];

      // 提取摘要
      const abstractText = fullRecord?.abstracts?.abstract?.abstract_text?.p || '';

      // 提取出版信息
      const pubInfo = summary.pub_info;
      const year = pubInfo?.['@pubyear'] ? parseInt(pubInfo['@pubyear'], 10) : undefined;
      const publishedDate = year ? new Date(year, 0, 1) : null;

      // 提取期刊信息
      const journal = pubInfo?.pub_title?.['#text'] || '';

      // 提取被引次数
      const citationCount = record.dynamic_data?.citation_related?.tc_list?.silo_tc?.local_count 
        ? parseInt(record.dynamic_data.citation_related.tc_list.silo_tc.local_count, 10) 
        : 0;

      // 提取关键词和分类
      const keywords = fullRecord?.keywords?.keyword?.map(kw => kw['#text']) || [];
      const categories = fullRecord?.category_info?.headings?.heading?.map(h => h['#text']) || [];

      // 构建URL
      const wosUrl = `https://www.webofscience.com/wos/woscc/full-record/${record.UID}`;

      return PaperFactory.create({
        paperId: record.UID,
        title: this.cleanText(title),
        authors: authors,
        abstract: this.cleanText(abstractText),
        doi: '', // WoS记录中的DOI需要从其他字段提取
        publishedDate: publishedDate,
        pdfUrl: '', // WoS通常不提供直接PDF链接
        url: wosUrl,
        source: 'webofscience',
        categories: categories,
        keywords: keywords,
        citationCount: citationCount,
        journal: journal,
        volume: pubInfo?.['@vol'] || undefined,
        issue: pubInfo?.['@issue'] || undefined,
        pages: this.extractPages(pubInfo),
        year: year,
        extra: {
          uid: record.UID,
          doctype: summary.doctypes?.doctype,
          pubtype: pubInfo?.['@pubtype']
        }
      });
    } catch (error) {
      console.error('Error parsing WoS record:', error);
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
        ...config.headers
      },
      timeout: 30000
    };

    return axios(url, requestConfig);
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