// ============================================
// AI Brainstorm - Starting Strategies
// ============================================

import type { StartingStrategyId } from '../types';
import { languageService } from '../prompts/language-service';

/**
 * First speaker selection method
 */
export type FirstSpeakerMethod = 
  | 'first-in-order'    // First agent by order
  | 'random'            // Random selection
  | 'most-relevant'     // Based on expertise matching
  | 'designated';       // User-specified

/**
 * Starting strategy definition
 */
export interface StartingStrategy {
  id: StartingStrategyId;
  name: string;
  icon: string;
  description: string;
  shortDescription: string;
  openingPromptTemplate: string;
  groundRulesTemplate: string;
  firstSpeakerMethod: FirstSpeakerMethod;
  agentInstructions: string;
}

/**
 * Strategy configuration (non-translatable parts)
 */
interface StrategyConfig {
  id: StartingStrategyId;
  icon: string;
  firstSpeakerMethod: FirstSpeakerMethod;
}

/**
 * Strategy configurations (icons and speaker methods - not translated)
 */
const strategyConfigs: StrategyConfig[] = [
  { id: 'open-brainstorm', icon: '💡', firstSpeakerMethod: 'random' },
  { id: 'structured-debate', icon: '⚖️', firstSpeakerMethod: 'first-in-order' },
  { id: 'decision-matrix', icon: '🎯', firstSpeakerMethod: 'most-relevant' },
  { id: 'problem-first', icon: '🔍', firstSpeakerMethod: 'first-in-order' },
  { id: 'expert-deep-dive', icon: '🎓', firstSpeakerMethod: 'most-relevant' },
  { id: 'devils-advocate', icon: '😈', firstSpeakerMethod: 'random' },
];

/**
 * Get all strategies with translations for the specified language
 */
export function getStrategies(targetLanguage?: string): StartingStrategy[] {
  const prompts = languageService.getPromptsSync(targetLanguage || '');
  
  return strategyConfigs.map(config => {
    const strategyPrompts = prompts.strategies[config.id as keyof typeof prompts.strategies];
    
    if (!strategyPrompts || typeof strategyPrompts === 'string') {
      // Fallback for defaultFirstTurnPrompt which is a string
      return null;
    }
    
    return {
      id: config.id,
      icon: config.icon,
      firstSpeakerMethod: config.firstSpeakerMethod,
      name: strategyPrompts.name,
      description: strategyPrompts.description,
      shortDescription: strategyPrompts.shortDescription,
      openingPromptTemplate: strategyPrompts.openingPromptTemplate,
      groundRulesTemplate: strategyPrompts.groundRulesTemplate,
      agentInstructions: strategyPrompts.agentInstructions,
    };
  }).filter((s): s is StartingStrategy => s !== null);
}

/**
 * Get built-in starting strategies (English - for backward compatibility)
 * @deprecated Use getStrategies(targetLanguage) instead
 */
export const startingStrategies: StartingStrategy[] = getStrategies('');

/**
 * Get a strategy by ID
 */
export function getStrategyById(id: StartingStrategyId, targetLanguage?: string): StartingStrategy | undefined {
  const strategies = getStrategies(targetLanguage);
  return strategies.find(s => s.id === id);
}

/**
 * Get a strategy config by ID (for icon and speaker method only)
 */
export function getStrategyConfig(id: StartingStrategyId): StrategyConfig | undefined {
  return strategyConfigs.find(s => s.id === id);
}

/**
 * Get default strategy
 */
export function getDefaultStrategy(targetLanguage?: string): StartingStrategy {
  const strategies = getStrategies(targetLanguage);
  return strategies[0]; // Open Brainstorm
}

/**
 * Build opening statement from strategy template
 */
export function buildOpeningStatement(
  strategy: StartingStrategy,
  subject: string,
  goal: string,
  customOpening?: string,
  targetLanguage?: string
): string {
  if (customOpening) {
    return customOpening;
  }

  // Get the strategy in the correct language
  const localizedStrategy = targetLanguage 
    ? getStrategyById(strategy.id, targetLanguage) 
    : strategy;
  
  const template = localizedStrategy?.openingPromptTemplate || strategy.openingPromptTemplate;
  
  return languageService.interpolate(template, { subject, goal });
}

/**
 * Build ground rules from strategy template
 */
export function buildGroundRules(
  strategy: StartingStrategy,
  customRules?: string,
  targetLanguage?: string
): string {
  if (customRules) {
    return customRules;
  }
  
  // Get the strategy in the correct language
  const localizedStrategy = targetLanguage 
    ? getStrategyById(strategy.id, targetLanguage) 
    : strategy;
  
  return localizedStrategy?.groundRulesTemplate || strategy.groundRulesTemplate;
}

/**
 * Select first speaker based on strategy method
 */
export function selectFirstSpeaker(
  method: FirstSpeakerMethod,
  agents: Array<{ id: string; expertise: string; order: number }>,
  subject: string,
  designatedId?: string
): string | null {
  if (agents.length === 0) return null;

  // Filter out secretary if present
  const participantAgents = agents.filter(a => !('isSecretary' in a && (a as any).isSecretary));
  if (participantAgents.length === 0) return agents[0]?.id || null;

  switch (method) {
    case 'first-in-order':
      return participantAgents.sort((a, b) => a.order - b.order)[0].id;

    case 'random':
      return participantAgents[Math.floor(Math.random() * participantAgents.length)].id;

    case 'most-relevant':
      return findMostRelevantAgent(participantAgents, subject);

    case 'designated':
      if (designatedId && participantAgents.some(a => a.id === designatedId)) {
        return designatedId;
      }
      // Fallback to first in order
      return participantAgents.sort((a, b) => a.order - b.order)[0].id;

    default:
      return participantAgents[0].id;
  }
}

/**
 * Find the most relevant agent based on expertise matching
 */
function findMostRelevantAgent(
  agents: Array<{ id: string; expertise: string; order: number }>,
  subject: string
): string {
  const subjectWords = subject.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
  
  let bestMatch = agents[0];
  let bestScore = 0;

  for (const agent of agents) {
    const expertiseWords = agent.expertise.toLowerCase().split(/[\s,]+/);
    let score = 0;

    for (const subjectWord of subjectWords) {
      for (const expertiseWord of expertiseWords) {
        if (expertiseWord.includes(subjectWord) || subjectWord.includes(expertiseWord)) {
          score += 1;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = agent;
    }
  }

  return bestMatch.id;
}

/**
 * Get strategy-specific agent instructions
 */
export function getAgentInstructions(strategyId: StartingStrategyId, targetLanguage?: string): string {
  const strategy = getStrategyById(strategyId, targetLanguage);
  return strategy?.agentInstructions || '';
}
