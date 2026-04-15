import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, catchError, map, tap, switchMap } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface BibliographySnapshot {
  id: number;
  title: string;
  source_ids: number[];
  default_style_id: string;
  default_style_name: string;
  annotatedBibliography: boolean;
  splitPrimarySecondary: boolean;
}

export interface InlineCitation {
  id: string;
  html: string;
}

export interface CitationResult {
  inline_citations: Record<string, InlineCitation>;
  html_bibliography_entries: string[];
}

/**
 * Service for interacting with the Scrible bibliography API.
 *
 * In standalone prototype mode (no session), this falls back to MLA-formatted
 * local citations. When integrated into toolbar2 with a valid session, it calls
 * the real Rails endpoints.
 */
@Injectable({ providedIn: 'root' })
export class BibliographyService {
  private apiBase = '/api';
  private usedEntryIds$ = new BehaviorSubject<Set<number>>(new Set());

  constructor(private http: HttpClient) {}

  /** Emits the set of entry IDs currently cited in the outline. */
  getUsedEntryIds(): Observable<Set<number>> {
    return this.usedEntryIds$.asObservable();
  }

  /** Update the set of used entry IDs (called by the editor on doc change). */
  updateUsedEntryIds(ids: Set<number>) {
    this.usedEntryIds$.next(ids);
  }

  /** Add a source to the project bibliography. */
  addToBibliography(projectId: number, entryId: number, bibliographyId?: number): Observable<BibliographySnapshot | null> {
    return this.http.put<BibliographySnapshot>(
      `${this.apiBase}/project/${projectId}/bibliography`,
      { bibliography: { add_sources: [entryId], bibliography: bibliographyId } }
    ).pipe(
      catchError(err => {
        console.warn('BibliographyService.addToBibliography failed:', err.message);
        return of(null);
      })
    );
  }

  /** Generate inline citation HTML for a specific entry. */
  getInlineCitation(bibliographyId: number, entryId: number, styleId = 'modern-language-association'): Observable<string | null> {
    return this.http.post<CitationResult>(
      `${this.apiBase}/citations/bibliography/${bibliographyId}`,
      { style_id: styleId }
    ).pipe(
      map(result => result.inline_citations?.[String(entryId)]?.html || null),
      catchError(err => {
        console.warn('BibliographyService.getInlineCitation failed:', err.message);
        return of(null);
      })
    );
  }

  /**
   * Fallback: format a citation locally when the bibliography API isn't available.
   * This is the standalone prototype path.
   */
  formatLocalMLA(source: { author?: string; title?: string; date?: string; url?: string }): string {
    const author = source.author || 'Unknown';
    const title = `\u201c${source.title || 'Untitled'}\u201d`;
    const date = source.date || new Date().getFullYear().toString();
    const accessed = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${author}. ${title}. ${date}. Web. ${accessed}.`;
  }
}
