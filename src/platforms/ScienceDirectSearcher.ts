/**
 * ScienceDirect (Elsevier) Searcher
 * 
 * Documentation: https://dev.elsevier.com/
 * API Endpoints:
 * - Search API: https://api.elsevier.com/content/search/sciencedirect
 * - Article API: https://api.elsevier.com/content/article/doi/
 * 
 * Required API Key: Yes (X-ELS-APIKey header)
 * Get API key from: https://dev.elsevier.com/apikey/manage
 */

import axios, { AxiosInstance } from 'axios';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
import { Paper, PaperFactory } from '../models/Paper.js';
import { RateLimiter } from '../utils/RateLimiter.js';

interface ElsevierSearchResponse {
  'search-results': {
    'opensearch:totalResults': string;
    'opensearch:startIndex': string;
    'opensearch:itemsPerPage': string;
    entry?: ElsevierEntry[];
    link?: Array<{
      '@ref': string;
      '@href': string;
      '@type': string;
    }>;
  };
}

interface ElsevierEntry {
  'dc:identifier': string;
  'dc:title': string;
  'dc:creator'?: string;
  'prism:publicationName'?: string;
  'prism:coverDate'?: string;
  'prism:doi'?: string;
  'prism:url'?: string;
  'dc:description'?: string;
  'prism:volume'?: string;
  'prism:issueIdentifier'?: string;
  'prism:pageRange'?: string;
  'pii'?: string;
  'load-date'?: string;
  link?: Array<{
    '@ref': string;
    '@href': string;
    '@type': string;
  }>;
  'openaccess'?: boolean;
  'openaccessFlag'?: boolean;
}

interface ElsevierArticleResponse {
  'full-text-retrieval-response': {
    coredata: {
      'dc:identifier': string;
      'dc:title': string;
      'dc:creator'?: any;
      'prism:publicationName'?: string;
      'prism:coverDate'?: string;
      'prism:doi'?: string;
      'dc:description'?: string;
      'prism:volume'?: string;
      'prism:issueIdentifier'?: string;
      'prism:pageRange'?: string;
      'citedby-count'?: string;
    };
    originalText?: string;
  };
}

export class ScienceDirectSearcher extends PaperSource {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor(apiKey?: string) {
    super('sciencedirect', 'https://api.elsevier.com', apiKey);
    
    this.client = axios.create({
      baseURL: 'https://api.elsevier.com',
      headers: {
        'Accept': 'application/json',
        ...(apiKey ? { 'X-ELS-APIKey': apiKey } : {})
      }
    });

    // Elsevier rate limits: 
    // - Without key: 20 requests per minute
    // - With key: 10 requests per second (600 per minute)
    const requestsPerSecond = apiKey ? 10 : 0.33;
    
    this.rateLimiter = new RateLimiter({ 
      requestsPerSecond,
      burstCapacity: apiKey ? 20 : 5
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<Paper[]> {
    const customOptions = options as any;
    if (!this.apiKey) {
      throw new Error('ScienceDirect API key is required');
    }

    const maxResults = options.maxResults || 10;
    const papers: Paper[] = [];

    try {
      // Build search query
      let searchQuery = query;
      
      if (options.author) {
        searchQuery += ` AND AUTHOR(${options.author})`;
      }
      
      if (options.journal) {
        searchQuery += ` AND SRCTITLE(${options.journal})`;
      }
      
      if (options.year) {
        if (options.year.includes('-')) {
          const [startYear, endYear] = options.year.split('-');
          searchQuery += ` AND PUBYEAR > ${parseInt(startYear) - 1}`;
          if (endYear) {
            searchQuery += ` AND PUBYEAR < ${parseInt(endYear) + 1}`;
          }
        } else {
          searchQuery += ` AND PUBYEAR = ${options.year}`;
        }
      }

      if (customOptions.openAccess) {
        searchQuery += ' AND OPENACCESS(1)';
      }

      await this.rateLimiter.waitForPermission();

      const response = await this.client.get<ElsevierSearchResponse>('/content/search/sciencedirect', {
        params: {
          query: searchQuery,
          count: maxResults,
          start: 0,
          view: 'COMPLETE'
        }
      });

      const entries = response.data['search-results']?.entry || [];

      for (const entry of entries) {
        const paper = await this.parseEntry(entry);
        if (paper) {
          papers.push(paper);
        }
      }

      return papers;
    } catch (error: any) {
      console.error('ScienceDirect search error:', error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid or missing ScienceDirect API key');
      }
      if (error.response?.status === 429) {
        throw new Error('ScienceDirect rate limit exceeded. Please try again later.');
      }
      throw error;
    }
  }

  private async parseEntry(entry: ElsevierEntry): Promise<Paper | null> {
    try {
      // Extract PDF URL if available
      let pdfUrl: string | undefined;
      if (entry.link) {
        const pdfLink = entry.link.find(l => l['@type'] === 'application/pdf');
        if (pdfLink) {
          pdfUrl = pdfLink['@href'];
        }
      }

      // Build paper URL
      const paperUrl = entry['prism:url'] || 
                      (entry['prism:doi'] ? `https://doi.org/${entry['prism:doi']}` : undefined);

      return PaperFactory.create({
        paperId: entry['prism:doi'] || entry['dc:identifier'] || entry.pii || '',
        title: entry['dc:title'] || '',
        authors: entry['dc:creator'] ? [entry['dc:creator']] : [],
        abstract: entry['dc:description'] || '',
        doi: entry['prism:doi'],
        publishedDate: entry['prism:coverDate'] ? new Date(entry['prism:coverDate']) : null,
        pdfUrl: pdfUrl,
        url: paperUrl,
        source: 'ScienceDirect',
        journal: entry['prism:publicationName'],
        volume: entry['prism:volume'],
        issue: entry['prism:issueIdentifier'],
        pages: entry['prism:pageRange'],
        extra: {
          pii: entry.pii,
          openAccess: entry.openaccess || entry.openaccessFlag || false
        }
      });
    } catch (error) {
      console.error('Error parsing ScienceDirect entry:', error);
      return null;
    }
  }

  async getArticleDetails(doi: string): Promise<Paper | null> {
    if (!this.apiKey) {
      throw new Error('ScienceDirect API key is required');
    }

    try {
      await this.rateLimiter.waitForPermission();

      const response = await this.client.get<ElsevierArticleResponse>(`/content/article/doi/${doi}`, {
        params: {
          view: 'FULL'
        }
      });

      const coredata = response.data['full-text-retrieval-response']?.coredata;
      if (!coredata) return null;

      // Extract authors
      let authors = '';
      if (coredata['dc:creator']) {
        if (Array.isArray(coredata['dc:creator'])) {
          authors = coredata['dc:creator'].map((a: any) => a.$).join(', ');
        } else if (typeof coredata['dc:creator'] === 'string') {
          authors = coredata['dc:creator'];
        }
      }

      return PaperFactory.create({
        paperId: doi,
        title: coredata['dc:title'] || '',
        authors: authors ? [authors] : [],
        abstract: coredata['dc:description'] || '',
        doi: coredata['prism:doi'] || doi,
        publishedDate: coredata['prism:coverDate'] ? new Date(coredata['prism:coverDate']) : null,
        url: `https://doi.org/${doi}`,
        source: 'ScienceDirect',
        journal: coredata['prism:publicationName'],
        volume: coredata['prism:volume'],
        issue: coredata['prism:issueIdentifier'],
        pages: coredata['prism:pageRange'],
        citationCount: coredata['citedby-count'] ? parseInt(coredata['citedby-count']) : undefined
      });
    } catch (error: any) {
      console.error('ScienceDirect article details error:', error.message);
      return null;
    }
  }

  getCapabilities(): PlatformCapabilities {
    return {
      search: true,
      download: false, // Requires institutional access
      fullText: false,
      citations: true,
      requiresApiKey: true,
      supportedOptions: ['maxResults', 'year', 'author', 'journal']
    };
  }

  async downloadPdf(paperId: string, options: DownloadOptions = {}): Promise<string> {
    throw new Error('PDF download requires institutional access for ScienceDirect');
  }

  async readPaper(paperId: string, options: DownloadOptions = {}): Promise<string> {
    const paper = await this.getArticleDetails(paperId);
    if (!paper) {
      throw new Error('Paper not found');
    }
    return paper.abstract || 'Abstract not available';
  }
}
