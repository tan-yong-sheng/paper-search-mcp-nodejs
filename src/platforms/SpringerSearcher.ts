/**
 * Springer Nature Searcher
 * 
 * Documentation: https://dev.springernature.com/
 * API Endpoints:
 * - Metadata API: https://api.springernature.com/metadata/json
 * - OpenAccess API: https://api.springernature.com/openaccess/json
 * 
 * Required API Key: Yes (api_key parameter)
 * Get API key from: https://dev.springernature.com/signup
 */

import axios, { AxiosInstance } from 'axios';
import { PaperSource, SearchOptions, DownloadOptions, PlatformCapabilities } from './PaperSource.js';
import { Paper, PaperFactory } from '../models/Paper.js';
import { RateLimiter } from '../utils/RateLimiter.js';

interface SpringerResponse {
  result: SpringerResult[];
  apiMessage?: string;
  facets?: any[];
  query?: string;
  records?: string;
  nextPage?: string;
}

interface SpringerResult {
  identifier: string;
  title: string;
  creators?: Array<{ creator: string }>;
  publicationName?: string;
  publicationDate?: string;
  doi?: string;
  url?: Array<{ format: string; platform: string; value: string }>;
  abstract?: string;
  volume?: string;
  number?: string;
  startingPage?: string;
  endingPage?: string;
  isbn?: string;
  issn?: string;
  genre?: string;
  contentType?: string;
  language?: string;
  openaccess?: string;
  copyright?: string;
}

export class SpringerSearcher extends PaperSource {
  private metadataClient: AxiosInstance;
  private openAccessClient: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor(apiKey?: string) {
    super('springer', 'https://api.springernature.com', apiKey);
    
    this.metadataClient = axios.create({
      baseURL: 'https://api.springernature.com/metadata',
      headers: {
        'Accept': 'application/json'
      }
    });

    this.openAccessClient = axios.create({
      baseURL: 'https://api.springernature.com/openaccess',
      headers: {
        'Accept': 'application/json'
      }
    });

    // Springer rate limits:
    // - 5000 requests per day
    // - Approximately 200 per hour or 3-4 per minute to be safe
    this.rateLimiter = new RateLimiter({ 
      requestsPerSecond: 0.05, // Conservative: 3 per minute
      burstCapacity: 5
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<Paper[]> {
    const customOptions = options as any;
    if (!this.apiKey) {
      throw new Error('Springer API key is required');
    }

    const maxResults = Math.min(options.maxResults || 10, 100);
    const papers: Paper[] = [];

    try {
      // Determine which API to use
      const useOpenAccess = customOptions.openAccess === true;
      const client = useOpenAccess ? this.openAccessClient : this.metadataClient;
      
      // Build query parameters
      const params: any = {
        q: query,
        api_key: this.apiKey,
        s: 1, // start index
        p: maxResults // page size
      };

      // Add filters
      if (options.author) {
        params.q += ` name:"${options.author}"`;
      }

      if (options.journal) {
        params.q += ` pub:"${options.journal}"`;
      }

      if (options.year) {
        if (options.year.includes('-')) {
          const [startYear, endYear] = options.year.split('-');
          params.q += ` year:${startYear} TO ${endYear || '*'}`;
        } else {
          params.q += ` year:${options.year}`;
        }
      }

      if (customOptions.subject) {
        params.q += ` subject:"${customOptions.subject}"`;
      }

      if (customOptions.type) {
        params.q += ` type:${customOptions.type}`;
      }

      await this.rateLimiter.waitForPermission();

      const endpoint = useOpenAccess ? '/json' : '/json';
      const response = await client.get<SpringerResponse>(endpoint, { params });

      if (response.data.result) {
        for (const result of response.data.result) {
          const paper = this.parseResult(result);
          if (paper) {
            papers.push(paper);
          }
        }
      }

      return papers;
    } catch (error: any) {
      console.error('Springer search error:', error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid or missing Springer API key');
      }
      if (error.response?.status === 429) {
        throw new Error('Springer rate limit exceeded. Please try again later.');
      }
      throw error;
    }
  }

  private parseResult(result: SpringerResult): Paper | null {
    try {
      // Extract authors
      const authors = result.creators?.map(c => c.creator).join(', ') || '';

      // Extract URL
      let paperUrl: string | undefined;
      let pdfUrl: string | undefined;
      
      if (result.url && result.url.length > 0) {
        for (const urlObj of result.url) {
          if (urlObj.format === 'pdf') {
            pdfUrl = urlObj.value;
          } else if (!paperUrl) {
            paperUrl = urlObj.value;
          }
        }
      }

      // If no URL found, construct from DOI
      if (!paperUrl && result.doi) {
        paperUrl = `https://doi.org/${result.doi}`;
      }

      // Extract page range
      let pages: string | undefined;
      if (result.startingPage && result.endingPage) {
        pages = `${result.startingPage}-${result.endingPage}`;
      } else if (result.startingPage) {
        pages = result.startingPage;
      }

      return PaperFactory.create({
        paperId: result.doi || result.identifier || '',
        title: result.title || '',
        authors: authors ? authors.split(', ') : [],
        abstract: result.abstract || '',
        doi: result.doi,
        publishedDate: result.publicationDate ? new Date(result.publicationDate) : null,
        pdfUrl: pdfUrl,
        url: paperUrl,
        source: 'Springer',
        journal: result.publicationName,
        volume: result.volume,
        issue: result.number,
        pages: pages,
        extra: {
          isbn: result.isbn,
          issn: result.issn,
          contentType: result.contentType,
          genre: result.genre,
          language: result.language,
          openAccess: result.openaccess === 'true',
          copyright: result.copyright
        }
      });
    } catch (error) {
      console.error('Error parsing Springer result:', error);
      return null;
    }
  }

  async downloadPdf(doi: string, options: { savePath?: string } = {}): Promise<string> {
    // Check if paper is open access first
    const papers = await this.search(doi, { maxResults: 1 } as any);
    
    if (papers.length === 0 || !papers[0].pdfUrl) {
      throw new Error('Paper not found or PDF not available (may require institutional access)');
    }

    const paper = papers[0];
    if (!paper.pdfUrl) {
      throw new Error('PDF URL not available for this paper');
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
        responseType: 'stream'
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
      download: true, // For open access papers
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
