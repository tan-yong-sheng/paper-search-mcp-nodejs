/**
 * Wiley TDM (Text and Data Mining) API Searcher
 * 
 * Documentation: https://onlinelibrary.wiley.com/library-info/resources/text-and-datamining
 * API Endpoints:
 * - Search API: https://api.wiley.com/onlinelibrary/tdm/v1/articles
 * 
 * Required: Wiley TDM Token (CR-TDM-Token header)
 * Get token from: https://onlinelibrary.wiley.com/library-info/resources/text-and-datamining
 */

import axios, { AxiosInstance } from 'axios';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
import { Paper, PaperFactory } from '../models/Paper.js';
import { RateLimiter } from '../utils/RateLimiter.js';

interface WileySearchResponse {
  items: WileyArticle[];
  total: number;
  nextCursor?: string;
}

interface WileyArticle {
  doi: string;
  title: string;
  authors?: Array<{
    given: string;
    family: string;
    affiliation?: Array<{ name: string }>;
  }>;
  published?: {
    'date-parts': number[][];
  };
  'published-print'?: {
    'date-parts': number[][];
  };
  'published-online'?: {
    'date-parts': number[][];
  };
  abstract?: string;
  URL?: string;
  'container-title'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  subject?: string[];
  type?: string;
  ISSN?: string[];
  license?: Array<{
    URL: string;
    'content-version': string;
    delay: number;
  }>;
  link?: Array<{
    URL: string;
    'content-type': string;
    'content-version': string;
    intended_application: string;
  }>;
}

export class WileySearcher extends PaperSource {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor(tdmToken?: string) {
    super('wiley', 'https://api.wiley.com/onlinelibrary/tdm/v1', tdmToken);
    
    this.client = axios.create({
      baseURL: 'https://api.wiley.com/onlinelibrary/tdm/v1',
      headers: {
        'Accept': 'application/json',
        ...(tdmToken ? { 'CR-TDM-Token': tdmToken } : {})
      }
    });

    // Wiley rate limits:
    // Conservative estimate: 100 requests per hour
    this.rateLimiter = new RateLimiter({
      requestsPerSecond: 0.028, // ~100 per hour
      burstCapacity: 3
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<Paper[]> {
    const customOptions = options as any;
    if (!this.apiKey) {
      throw new Error('Wiley TDM token is required');
    }

    const maxResults = Math.min(options.maxResults || 10, 100);
    const papers: Paper[] = [];

    try {
      // Build search filters
      const filters: string[] = [];
      
      // Add query
      filters.push(`title:${query} OR abstract:${query}`);

      // Add author filter
      if (options.author) {
        filters.push(`author:${options.author}`);
      }

      // Add journal filter
      if (options.journal) {
        filters.push(`container-title:"${options.journal}"`);
      }

      // Add year filter
      if (options.year) {
        if (options.year.includes('-')) {
          const [startYear, endYear] = options.year.split('-');
          filters.push(`published:${startYear}-01-01:${endYear || '*'}-12-31`);
        } else {
          filters.push(`published:${options.year}-01-01:${options.year}-12-31`);
        }
      }

      // Add subject filter
      if (customOptions.subject) {
        filters.push(`subject:"${customOptions.subject}"`);
      }

      // Add open access filter
      if (customOptions.openAccess) {
        filters.push('license:*');
      }

      await this.rateLimiter.waitForPermission();

      const response = await this.client.get<WileySearchResponse>('/articles', {
        params: {
          filter: filters.join(' AND '),
          rows: maxResults,
          offset: 0
        }
      });

      if (response.data.items) {
        for (const article of response.data.items) {
          const paper = this.parseArticle(article);
          if (paper) {
            papers.push(paper);
          }
        }
      }

      return papers;
    } catch (error: any) {
      console.error('Wiley search error:', error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid or missing Wiley TDM token');
      }
      if (error.response?.status === 429) {
        throw new Error('Wiley rate limit exceeded. Please try again later.');
      }
      throw error;
    }
  }

  private parseArticle(article: WileyArticle): Paper | null {
    try {
      // Extract authors
      let authors = '';
      if (article.authors && article.authors.length > 0) {
        authors = article.authors
          .map(a => `${a.given} ${a.family}`.trim())
          .join(', ');
      }

      // Extract publication date
      let publishedDate = '';
      const dateData = article.published || article['published-print'] || article['published-online'];
      if (dateData && dateData['date-parts'] && dateData['date-parts'][0]) {
        const [year, month, day] = dateData['date-parts'][0];
        publishedDate = `${year}${month ? `-${String(month).padStart(2, '0')}` : ''}${day ? `-${String(day).padStart(2, '0')}` : ''}`;
      }

      // Extract PDF URL if available
      let pdfUrl: string | undefined;
      if (article.link) {
        const pdfLink = article.link.find(l => 
          l['content-type'] === 'application/pdf' || 
          l['content-type'] === 'unspecified' && l.URL.includes('.pdf')
        );
        if (pdfLink) {
          pdfUrl = pdfLink.URL;
        }
      }

      // Construct paper URL
      const paperUrl = article.URL || (article.doi ? `https://doi.org/${article.doi}` : undefined);

      return PaperFactory.create({
        paperId: article.doi || '',
        title: article.title || '',
        authors: authors ? authors.split(', ') : [],
        abstract: article.abstract || '',
        doi: article.doi,
        publishedDate: publishedDate ? new Date(publishedDate) : null,
        pdfUrl: pdfUrl,
        url: paperUrl,
        source: 'Wiley',
        journal: article['container-title'],
        volume: article.volume,
        issue: article.issue,
        pages: article.page,
        extra: {
          publisher: article.publisher,
          type: article.type,
          subjects: article.subject,
          issn: article.ISSN,
          licenses: article.license
        }
      });
    } catch (error) {
      console.error('Error parsing Wiley article:', error);
      return null;
    }
  }

  async downloadPdf(doi: string, options: { savePath?: string } = {}): Promise<string> {
    // Search for the paper first
    const papers = await this.search(doi, { maxResults: 1 });
    
    if (papers.length === 0) {
      throw new Error('Paper not found');
    }

    const paper = papers[0];
    if (!paper.pdfUrl) {
      throw new Error('PDF not available for this paper (may require institutional access)');
    }

    // Download PDF
    const fs = await import('fs');
    const path = await import('path');
    
    const savePath = options.savePath || './downloads';
    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    const fileName = `${doi.replace(/[\/\\:*?"<>|]/g, '_')}.pdf`;
    const filePath = path.join(savePath, fileName);

    try {
      const response = await axios.get(paper.pdfUrl, {
        responseType: 'stream',
        headers: {
          'CR-TDM-Token': this.apiKey
        }
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
      });
    } catch (error: any) {
      throw new Error(`Failed to download PDF: ${error.message}`);
    }
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: true, // With TDM token
      fullText: false,
      citations: false,
      requiresApiKey: true,
      supportedOptions: ['maxResults', 'year', 'author', 'journal']
    };
  }

  async readPaper(paperId: string, options: DownloadOptions = {}): Promise<string> {
    const papers = await this.search(paperId, { maxResults: 1 });
    if (papers.length === 0) {
      throw new Error('Paper not found');
    }
    return papers[0].abstract || 'Abstract not available';
  }
}
