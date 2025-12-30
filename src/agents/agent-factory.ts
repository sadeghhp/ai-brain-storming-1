// ============================================
// AI Brainstorm - Agent Factory
// ============================================

import { Agent } from './agent';
import { agentStorage, presetStorage } from '../storage/storage-manager';
import { generateAgentColor } from '../utils/helpers';
import type { CreateAgent } from '../types';

export interface CreateAgentOptions {
  conversationId: string;
  name: string;
  role: string;
  expertise: string;
  presetId?: string;
  llmProviderId: string;
  modelId: string;
  thinkingDepth?: number;
  creativityLevel?: number;
  notebookUsage?: number;
  isSecretary?: boolean;
  order: number;
}

/**
 * Agent Factory - Creates and configures agents
 */
export class AgentFactory {
  /**
   * Create an agent from scratch
   */
  static async create(options: CreateAgentOptions): Promise<Agent> {
    const data: CreateAgent = {
      conversationId: options.conversationId,
      name: options.name,
      role: options.role,
      expertise: options.expertise,
      presetId: options.presetId,
      llmProviderId: options.llmProviderId,
      modelId: options.modelId,
      thinkingDepth: options.thinkingDepth ?? 3,
      creativityLevel: options.creativityLevel ?? 3,
      notebookUsage: options.notebookUsage ?? 50,
      isSecretary: options.isSecretary ?? false,
      color: generateAgentColor(options.order),
      order: options.order,
    };

    const entity = await agentStorage.create(data);
    return new Agent(entity);
  }

  /**
   * Create an agent from a preset
   */
  static async createFromPreset(
    conversationId: string,
    presetId: string,
    llmProviderId: string,
    modelId: string,
    order: number,
    overrides?: Partial<CreateAgentOptions>
  ): Promise<Agent | null> {
    const preset = await presetStorage.getById(presetId);
    if (!preset) {
      console.warn(`[AgentFactory] Preset not found: ${presetId}`);
      return null;
    }

    return this.create({
      conversationId,
      name: overrides?.name ?? preset.name,
      role: overrides?.role ?? preset.name,
      expertise: preset.expertise,
      presetId: preset.id,
      llmProviderId,
      modelId,
      thinkingDepth: overrides?.thinkingDepth ?? preset.defaultThinkingDepth,
      creativityLevel: overrides?.creativityLevel ?? preset.defaultCreativityLevel,
      notebookUsage: overrides?.notebookUsage ?? 50,
      isSecretary: overrides?.isSecretary ?? false,
      order,
    });
  }

  /**
   * Create the secretary agent
   */
  static async createSecretary(
    conversationId: string,
    llmProviderId: string,
    modelId: string,
    order: number
  ): Promise<Agent> {
    return this.create({
      conversationId,
      name: 'Secretary',
      role: 'Meeting Secretary & Summarizer',
      expertise: 'Note-taking, summarization, capturing key decisions and action items',
      llmProviderId,
      modelId,
      thinkingDepth: 4, // Needs to be thorough
      creativityLevel: 2, // Should be accurate, not creative
      notebookUsage: 0, // Doesn't need personal notes
      isSecretary: true,
      order,
    });
  }

  /**
   * Create a team of agents for a conversation
   */
  static async createTeam(
    conversationId: string,
    configs: Array<{
      presetId?: string;
      name?: string;
      role?: string;
      expertise?: string;
      llmProviderId: string;
      modelId: string;
      thinkingDepth?: number;
      creativityLevel?: number;
    }>,
    includeSecretary: boolean = true
  ): Promise<Agent[]> {
    const agents: Agent[] = [];

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      let agent: Agent | null;

      if (config.presetId) {
        agent = await this.createFromPreset(
          conversationId,
          config.presetId,
          config.llmProviderId,
          config.modelId,
          i,
          {
            name: config.name,
            role: config.role,
            thinkingDepth: config.thinkingDepth,
            creativityLevel: config.creativityLevel,
          }
        );
      } else {
        agent = await this.create({
          conversationId,
          name: config.name || `Agent ${i + 1}`,
          role: config.role || 'Participant',
          expertise: config.expertise || 'General discussion',
          llmProviderId: config.llmProviderId,
          modelId: config.modelId,
          thinkingDepth: config.thinkingDepth,
          creativityLevel: config.creativityLevel,
          order: i,
        });
      }

      if (agent) {
        agents.push(agent);
      }
    }

    // Add secretary at the end if requested
    if (includeSecretary && configs.length > 0) {
      // Use the first agent's LLM config for secretary
      const firstConfig = configs[0];
      const secretary = await this.createSecretary(
        conversationId,
        firstConfig.llmProviderId,
        firstConfig.modelId,
        configs.length
      );
      agents.push(secretary);
    }

    return agents;
  }

  /**
   * Clone an existing agent to a new conversation
   */
  static async clone(agentId: string, newConversationId: string, newOrder: number): Promise<Agent | null> {
    const original = await agentStorage.getById(agentId);
    if (!original) return null;

    return this.create({
      conversationId: newConversationId,
      name: original.name,
      role: original.role,
      expertise: original.expertise,
      presetId: original.presetId,
      llmProviderId: original.llmProviderId,
      modelId: original.modelId,
      thinkingDepth: original.thinkingDepth,
      creativityLevel: original.creativityLevel,
      notebookUsage: original.notebookUsage,
      isSecretary: original.isSecretary,
      order: newOrder,
    });
  }
}

