// ============================================
// AI Brainstorm - Notebook Manager
// ============================================

import { notebookStorage } from '../storage/storage-manager';
import { llmRouter } from '../llm/llm-router';
import { buildNotePrompt } from '../llm/prompt-builder';
import { countTokens } from '../llm/token-counter';
import type { Notebook, Agent } from '../types';

const MAX_NOTE_LENGTH = 100; // Max characters per note entry
const MAX_NOTES_SIZE = 2000; // Max total characters

/**
 * Notebook Manager
 * Handles automatic note-taking and note management for agents
 */
export class NotebookManager {
  private agentId: string;
  private llmProviderId: string;
  private modelId: string;

  constructor(agentId: string, llmProviderId: string, modelId: string) {
    this.agentId = agentId;
    this.llmProviderId = llmProviderId;
    this.modelId = modelId;
  }

  /**
   * Get current notebook content
   */
  async getNotebook(): Promise<Notebook | undefined> {
    return notebookStorage.get(this.agentId);
  }

  /**
   * Get notes as string
   */
  async getNotes(): Promise<string> {
    const notebook = await this.getNotebook();
    return notebook?.notes || '';
  }

  /**
   * Append a note manually
   */
  async addNote(note: string): Promise<void> {
    const trimmedNote = this.trimNote(note);
    const currentNotes = await this.getNotes();

    // Check if we need to prune old notes
    if (currentNotes.length + trimmedNote.length > MAX_NOTES_SIZE) {
      await this.pruneNotes(trimmedNote.length);
    }

    await notebookStorage.append(this.agentId, trimmedNote);
  }

  /**
   * Automatically extract notes from a message
   */
  async autoExtractNotes(message: string): Promise<string | null> {
    const currentNotes = await this.getNotes();

    // Skip if message is too short
    if (countTokens(message) < 20) {
      return null;
    }

    try {
      const prompt = buildNotePrompt(message, currentNotes);
      const response = await llmRouter.complete(this.llmProviderId, {
        model: this.modelId,
        messages: prompt,
        maxTokens: 100,
        temperature: 0.3, // Low temperature for factual extraction
      });

      const extractedNote = response.content.trim();

      // Skip if no meaningful note extracted
      if (!extractedNote || extractedNote.toLowerCase().includes('no new') || extractedNote.length < 10) {
        return null;
      }

      await this.addNote(extractedNote);
      return extractedNote;
    } catch (error) {
      console.warn('[NotebookManager] Failed to extract notes:', error);
      return null;
    }
  }

  /**
   * Clear all notes
   */
  async clearNotes(): Promise<void> {
    await notebookStorage.clear(this.agentId);
  }

  /**
   * Get notes formatted for prompt injection
   */
  async getNotesForPrompt(maxTokens: number): Promise<string> {
    const notes = await this.getNotes();
    if (!notes) return '';

    const currentTokens = countTokens(notes);
    if (currentTokens <= maxTokens) {
      return notes;
    }

    // Truncate from the beginning (keep most recent)
    const entries = notes.split('\n---\n');
    let result = '';
    let tokens = 0;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entryTokens = countTokens(entries[i]);
      if (tokens + entryTokens <= maxTokens) {
        result = entries[i] + (result ? '\n---\n' + result : '');
        tokens += entryTokens;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Search notes for a keyword
   */
  async searchNotes(keyword: string): Promise<string[]> {
    const notes = await this.getNotes();
    if (!notes) return [];

    const entries = notes.split('\n---\n');
    const lowerKeyword = keyword.toLowerCase();

    return entries.filter(entry => 
      entry.toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * Get note count
   */
  async getNoteCount(): Promise<number> {
    const notes = await this.getNotes();
    if (!notes) return 0;
    return notes.split('\n---\n').length;
  }

  // ----- Private Methods -----

  private trimNote(note: string): string {
    if (note.length <= MAX_NOTE_LENGTH) {
      return note;
    }
    return note.slice(0, MAX_NOTE_LENGTH - 3) + '...';
  }

  private async pruneNotes(spaceNeeded: number): Promise<void> {
    const notes = await this.getNotes();
    if (!notes) return;

    const entries = notes.split('\n---\n');
    let currentSize = notes.length;
    let removeCount = 0;

    // Remove oldest entries until we have enough space
    while (currentSize + spaceNeeded > MAX_NOTES_SIZE && removeCount < entries.length) {
      currentSize -= entries[removeCount].length + 4; // +4 for separator
      removeCount++;
    }

    if (removeCount > 0) {
      const remaining = entries.slice(removeCount).join('\n---\n');
      await notebookStorage.update(this.agentId, remaining);
    }
  }

  // ----- Static Factory Methods -----

  static fromAgent(agent: Agent): NotebookManager {
    return new NotebookManager(
      agent.id,
      agent.llmProviderId,
      agent.modelId
    );
  }

  static async createForAgent(agentId: string): Promise<NotebookManager | null> {
    const { agentStorage } = await import('../storage/storage-manager');
    const agent = await agentStorage.getById(agentId);
    if (!agent) return null;

    return new NotebookManager(agentId, agent.llmProviderId, agent.modelId);
  }
}

