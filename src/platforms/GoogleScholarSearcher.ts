/**
 * Google Scholar搜索器 - 网页抓取实现
 * 基于HTML解析，包含反检测机制
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { Paper, PaperFactory } from '../models/Paper.js';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';

interface GoogleScholarOptions extends SearchOptions {
  /** 语言设置 */
  language?: string;
  /** 时间范围（年份） */
  yearLow?: number;
  yearHigh?: number;
}

export class GoogleScholarSearcher extends PaperSource {
  private readonly scholarUrl = 'https://scholar.google.com/scholar';
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  ];
  
  constructor() {
    super('google_scholar', 'https://scholar.google.com');
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: false, // Google Scholar不提供直接下载
      fullText: false, // 只有元数据和摘要
      citations: true, // 可以获取引用次数
      requiresApiKey: false, // 不需要API密钥，但可能被限制
      supportedOptions: ['maxResults', 'year', 'author']
    };
  }

  /**
   * 搜索Google Scholar论文
   */
  async search(query: string, options: GoogleScholarOptions = {}): Promise<Paper[]> {
    console.error(`🔍 Google Scholar Search: query="${query}"`);
    
    try {
      const papers: Paper[] = [];
      let start = 0;
      const resultsPerPage = 10;
      const maxResults = options.maxResults || 10;

      while (papers.length < maxResults) {
        // 添加随机延迟避免检测
        await this.randomDelay();
        
        const params = this.buildSearchParams(query, start, options);
        const response = await this.makeScholarRequest(params);
        
        if (response.status !== 200) {
          console.error(`❌ Google Scholar HTTP Error: ${response.status}`);
          break;
        }

        const $ = cheerio.load(response.data);
        const results = $('.gs_ri'); // 搜索结果容器

        if (results.length === 0) {
          console.error('📋 No more results found');
          break;
        }

        console.error(`📊 Found ${results.length} results on page`);

        // 解析每个结果
        results.each((index, element) => {
          if (papers.length >= maxResults) return false; // 停止遍历
          
          const paper = this.parseScholarResult($, $(element));
          if (paper) {
            papers.push(paper);
          }
        });

        start += resultsPerPage;
      }

      console.error(`📄 Google Scholar Results: Found ${papers.length} papers`);
      return papers;
      
    } catch (error) {
      this.handleHttpError(error, 'search');
    }
  }

  /**
   * Google Scholar不支持直接PDF下载
   */
  async downloadPdf(paperId: string, options?: DownloadOptions): Promise<string> {
    throw new Error('Google Scholar does not support direct PDF download. Please use the paper URL to access the publisher.');
  }

  /**
   * Google Scholar不提供全文内容
   */
  async readPaper(paperId: string, options?: DownloadOptions): Promise<string> {
    throw new Error('Google Scholar does not provide full-text content. Please use the paper URL to access the full text.');
  }

  /**
   * 构建搜索参数
   */
  private buildSearchParams(query: string, start: number, options: GoogleScholarOptions): Record<string, any> {
    const params: Record<string, any> = {
      q: query,
      start: start,
      hl: options.language || 'en',
      as_sdt: '0,5', // 包括文章和引用
      as_vis: '1' // 排除引用，只显示学术论文
    };

    // 添加年份过滤
    if (options.yearLow || options.yearHigh) {
      params.as_ylo = options.yearLow || '';
      params.as_yhi = options.yearHigh || '';
    }

    // 添加作者过滤
    if (options.author) {
      params.as_sauthors = options.author;
    }

    return params;
  }

  /**
   * 发起Scholar请求
   */
  private async makeScholarRequest(params: Record<string, any>): Promise<any> {
    const userAgent = this.getRandomUserAgent();
    
    const config = {
      params,
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    };

    console.error(`🔍 Google Scholar Request: GET ${this.scholarUrl}`);
    console.error(`📋 Scholar params:`, params);

    return await axios.get(this.scholarUrl, config);
  }

  /**
   * 解析单个Scholar搜索结果
   */
  private parseScholarResult($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): Paper | null {
    try {
      // 提取标题和链接
      const titleElement = element.find('h3.gs_rt');
      const titleLink = titleElement.find('a');
      const title = titleElement.text().replace(/^\[PDF\]|\[HTML\]|\[BOOK\]|\[B\]/, '').trim();
      const url = titleLink.attr('href') || '';

      if (!title) {
        return null;
      }

      // 过滤掉书籍结果，优先学术论文
      const titleText = titleElement.text();
      if (titleText.includes('[BOOK]') || titleText.includes('[B]') || 
          url.includes('books.google.com')) {
        return null; // 跳过书籍结果
      }

      // 提取作者和出版信息
      const infoElement = element.find('div.gs_a');
      const infoText = infoElement.text();
      const authors = this.extractAuthors(infoText);
      const year = this.extractYear(infoText);

      // 提取摘要
      const abstractElement = element.find('div.gs_rs');
      const abstract = abstractElement.text() || '';

      // 提取引用次数
      const citationElement = element.find('div.gs_fl a').filter((i, el) => {
        return $(el).text().includes('Cited by');
      });
      const citationText = citationElement.text();
      const citationCount = this.extractCitationCount(citationText);

      // 生成论文ID
      const paperId = this.generatePaperId(title, authors);

      return PaperFactory.create({
        paperId,
        title: this.cleanText(title),
        authors,
        abstract: this.cleanText(abstract),
        doi: '', // Google Scholar通常不直接提供DOI
        publishedDate: year ? new Date(year, 0, 1) : null,
        pdfUrl: '', // 需要额外处理PDF链接
        url,
        source: 'google_scholar',
        categories: [],
        keywords: [],
        citationCount,
        journal: this.extractJournal(infoText),
        year,
        extra: {
          scholarId: paperId,
          infoText
        }
      });
    } catch (error) {
      console.error('Error parsing Google Scholar result:', error);
      return null;
    }
  }

  /**
   * 提取作者信息
   */
  private extractAuthors(infoText: string): string[] {
    const parts = infoText.split(' - ');
    if (parts.length > 0) {
      const authorPart = parts[0];
      return authorPart.split(',').map(author => author.trim()).filter(a => a.length > 0);
    }
    return [];
  }

  /**
   * 提取年份
   */
  private extractYear(text: string): number | undefined {
    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0], 10) : undefined;
  }

  /**
   * 提取期刊信息
   */
  private extractJournal(infoText: string): string {
    const parts = infoText.split(' - ');
    if (parts.length > 1) {
      // 通常期刊在第二部分
      return parts[1].split(',')[0].trim();
    }
    return '';
  }

  /**
   * 提取引用次数
   */
  private extractCitationCount(citationText: string): number {
    const match = citationText.match(/Cited by (\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 生成论文ID
   */
  private generatePaperId(title: string, authors: string[]): string {
    const titleHash = this.simpleHash(title);
    const authorHash = this.simpleHash(authors.join(''));
    return `gs_${titleHash}_${authorHash}`;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 获取随机User-Agent
   */
  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * 随机延迟
   */
  private async randomDelay(): Promise<void> {
    const delay = Math.random() * 2000 + 1000; // 1-3秒随机延迟
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}