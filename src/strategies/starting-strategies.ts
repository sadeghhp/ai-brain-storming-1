// ============================================
// AI Brainstorm - Starting Strategies
// Version: 1.0.0
// ============================================

import type { StartingStrategyId } from '../types';

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
 * Built-in starting strategies
 */
export const startingStrategies: StartingStrategy[] = [
  {
    id: 'open-brainstorm',
    name: 'Open Brainstorm',
    icon: '💡',
    description: 'Free-form exploration encouraging diverse ideas and creative thinking. Best for generating new concepts without constraints.',
    shortDescription: 'Free-form idea exploration',
    openingPromptTemplate: `Let's brainstorm about: {subject}

Our goal: {goal}

This is an open brainstorming session. All ideas are welcome - think creatively, build on each other's thoughts, and don't hold back on unconventional suggestions.`,
    groundRulesTemplate: `Brainstorming Guidelines:
- All ideas are valid - no criticism during ideation
- Build on others' ideas with "Yes, and..."
- Quantity over quality initially
- Think outside the box
- Combine and improve ideas freely`,
    firstSpeakerMethod: 'random',
    agentInstructions: 'Generate diverse ideas freely. Build on others\' suggestions. Be creative and unconventional.',
  },
  {
    id: 'structured-debate',
    name: 'Structured Debate',
    icon: '⚖️',
    description: 'Pro/con analysis with agents taking different positions. Ideal for thoroughly examining trade-offs and making informed decisions.',
    shortDescription: 'Pro/con analysis & trade-offs',
    openingPromptTemplate: `Topic for debate: {subject}

Our goal: {goal}

This is a structured debate. Each participant should present clear arguments, consider opposing viewpoints, and engage constructively with different perspectives.`,
    groundRulesTemplate: `Debate Guidelines:
- Present clear, reasoned arguments
- Support claims with evidence or examples
- Acknowledge valid points from others
- Challenge ideas, not people
- Seek to understand before disagreeing`,
    firstSpeakerMethod: 'first-in-order',
    agentInstructions: 'Take a clear position and defend it with reasoning. Engage with counterarguments respectfully.',
  },
  {
    id: 'decision-matrix',
    name: 'Decision Making',
    icon: '🎯',
    description: 'Systematic evaluation of options against criteria. Best for complex decisions with multiple factors to consider.',
    shortDescription: 'Evaluate options systematically',
    openingPromptTemplate: `Decision to make: {subject}

Our goal: {goal}

This is a decision-making discussion. We'll identify options, define evaluation criteria, and systematically assess each option to reach a well-reasoned conclusion.`,
    groundRulesTemplate: `Decision-Making Guidelines:
- Clearly define the options being considered
- Identify key evaluation criteria
- Assess each option against criteria
- Consider risks and trade-offs
- Aim for consensus or clear recommendation`,
    firstSpeakerMethod: 'most-relevant',
    agentInstructions: 'Evaluate options methodically. Consider criteria, risks, and trade-offs. Work toward actionable recommendations.',
  },
  {
    id: 'problem-first',
    name: 'Problem Solving',
    icon: '🔍',
    description: 'Start by deeply understanding the problem before proposing solutions. Ensures solutions address root causes.',
    shortDescription: 'Understand before solving',
    openingPromptTemplate: `Problem to solve: {subject}

Our goal: {goal}

Let's start by thoroughly understanding the problem. What are the root causes? Who is affected? What constraints exist? Only after we understand the problem fully should we discuss solutions.`,
    groundRulesTemplate: `Problem-Solving Guidelines:
- Define the problem clearly before solutions
- Ask "why" to find root causes
- Identify constraints and requirements
- Consider who is affected
- Solutions should address root causes`,
    firstSpeakerMethod: 'first-in-order',
    agentInstructions: 'Focus on understanding the problem deeply before proposing solutions. Identify root causes and constraints.',
  },
  {
    id: 'expert-deep-dive',
    name: 'Expert Analysis',
    icon: '🎓',
    description: 'The most relevant expert leads with in-depth analysis. Others build on and challenge the expert perspective.',
    shortDescription: 'Expert-led deep analysis',
    openingPromptTemplate: `Topic for expert analysis: {subject}

Our goal: {goal}

Our domain expert will lead with a detailed analysis. Others should then build on this foundation, ask probing questions, and offer complementary perspectives.`,
    groundRulesTemplate: `Expert Analysis Guidelines:
- Lead expert provides comprehensive initial analysis
- Others ask clarifying questions
- Challenge assumptions constructively
- Identify gaps in the analysis
- Build a complete picture together`,
    firstSpeakerMethod: 'most-relevant',
    agentInstructions: 'If you are the domain expert, provide thorough analysis. Others should probe, question, and complement.',
  },
  {
    id: 'devils-advocate',
    name: 'Devil\'s Advocate',
    icon: '😈',
    description: 'Begin by challenging assumptions and conventional thinking. Stress-tests ideas for robustness.',
    shortDescription: 'Challenge assumptions',
    openingPromptTemplate: `Let's stress-test: {subject}

Our goal: {goal}

We'll begin by challenging assumptions and conventional wisdom. What could go wrong? What are we missing? Let's find the weak points in our thinking.`,
    groundRulesTemplate: `Devil's Advocate Guidelines:
- Challenge assumptions and status quo
- Ask "what could go wrong?"
- Look for blind spots and biases
- Test ideas to destruction
- Strengthen through critique`,
    firstSpeakerMethod: 'random',
    agentInstructions: 'Challenge assumptions actively. Look for flaws and blind spots. Critique constructively to strengthen ideas.',
  },
];

/**
 * Get a strategy by ID
 */
export function getStrategyById(id: StartingStrategyId): StartingStrategy | undefined {
  return startingStrategies.find(s => s.id === id);
}

/**
 * Get default strategy
 */
export function getDefaultStrategy(): StartingStrategy {
  return startingStrategies[0]; // Open Brainstorm
}

/**
 * Build opening statement from strategy template
 */
export function buildOpeningStatement(
  strategy: StartingStrategy,
  subject: string,
  goal: string,
  customOpening?: string
): string {
  if (customOpening) {
    return customOpening;
  }

  return strategy.openingPromptTemplate
    .replace('{subject}', subject)
    .replace('{goal}', goal);
}

/**
 * Build ground rules from strategy template
 */
export function buildGroundRules(
  strategy: StartingStrategy,
  customRules?: string
): string {
  if (customRules) {
    return customRules;
  }
  return strategy.groundRulesTemplate;
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
export function getAgentInstructions(strategyId: StartingStrategyId): string {
  const strategy = getStrategyById(strategyId);
  return strategy?.agentInstructions || '';
}

