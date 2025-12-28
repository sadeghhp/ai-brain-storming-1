// ============================================
// AI Brainstorm - Conversation Templates
// Version: 1.0.0
// ============================================

import type { StartingStrategyId, ConversationMode } from '../types';

/**
 * Template category identifier
 */
export type TemplateCategory = 
  | 'software'
  | 'business'
  | 'finance'
  | 'design'
  | 'general';

/**
 * Conversation template definition
 */
export interface ConversationTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  icon: string;
  description: string;
  subject: string;
  goal: string;
  mode: ConversationMode;
  strategy: StartingStrategyId;
  recommendedPresets: string[];  // Preset IDs
  openingStatement?: string;
  groundRules?: string;
}

/**
 * Template category metadata
 */
export const templateCategories: Array<{ id: TemplateCategory; name: string; icon: string }> = [
  { id: 'software', name: 'Software Development', icon: '💻' },
  { id: 'business', name: 'Business Strategy', icon: '💼' },
  { id: 'finance', name: 'Finance & Investment', icon: '📈' },
  { id: 'design', name: 'Design & UX', icon: '🎨' },
  { id: 'general', name: 'General Discussion', icon: '💬' },
];

/**
 * Built-in conversation templates
 */
export const conversationTemplates: ConversationTemplate[] = [
  // Software Development Templates
  {
    id: 'template-architecture-review',
    name: 'Architecture Review',
    category: 'software',
    icon: '🏗️',
    description: 'Multi-perspective review of system architecture with focus on scalability, maintainability, and best practices.',
    subject: 'System Architecture Review',
    goal: 'Evaluate the proposed architecture, identify potential issues, and recommend improvements for scalability and maintainability.',
    mode: 'round-robin',
    strategy: 'expert-deep-dive',
    recommendedPresets: [
      'preset-software-architect',
      'preset-senior-backend',
      'preset-devops-engineer',
      'preset-security-expert',
    ],
    openingStatement: `We're reviewing a system architecture. Let's evaluate it from multiple angles:
- Overall design patterns and structure
- Scalability and performance considerations
- Security implications
- Operational concerns
- Maintainability and technical debt`,
  },
  {
    id: 'template-code-review',
    name: 'Code Review Discussion',
    category: 'software',
    icon: '🔍',
    description: 'Collaborative code review focusing on quality, patterns, and best practices.',
    subject: 'Code Review Session',
    goal: 'Review code changes for quality, identify improvements, and ensure adherence to best practices and team standards.',
    mode: 'dynamic',
    strategy: 'structured-debate',
    recommendedPresets: [
      'preset-senior-frontend',
      'preset-senior-backend',
      'preset-qa-engineer',
      'preset-security-expert',
    ],
  },
  {
    id: 'template-feature-planning',
    name: 'Feature Planning',
    category: 'software',
    icon: '📋',
    description: 'Plan and scope a new feature with input from technical and product perspectives.',
    subject: 'New Feature Planning',
    goal: 'Define scope, technical approach, and implementation plan for a new feature.',
    mode: 'round-robin',
    strategy: 'problem-first',
    recommendedPresets: [
      'preset-product-manager',
      'preset-software-architect',
      'preset-senior-frontend',
      'preset-ux-designer',
    ],
  },
  {
    id: 'template-tech-debt',
    name: 'Tech Debt Assessment',
    category: 'software',
    icon: '🧹',
    description: 'Identify, prioritize, and plan addressing technical debt.',
    subject: 'Technical Debt Assessment',
    goal: 'Catalog existing technical debt, assess impact, and prioritize remediation efforts.',
    mode: 'round-robin',
    strategy: 'decision-matrix',
    recommendedPresets: [
      'preset-software-architect',
      'preset-senior-backend',
      'preset-devops-engineer',
      'preset-qa-engineer',
    ],
  },
  {
    id: 'template-incident-postmortem',
    name: 'Incident Postmortem',
    category: 'software',
    icon: '🚨',
    description: 'Blameless analysis of an incident to prevent recurrence.',
    subject: 'Incident Postmortem Analysis',
    goal: 'Understand what happened, identify root causes, and define preventive measures.',
    mode: 'round-robin',
    strategy: 'problem-first',
    recommendedPresets: [
      'preset-devops-engineer',
      'preset-senior-backend',
      'preset-software-architect',
      'preset-security-expert',
    ],
    groundRules: `Postmortem Guidelines:
- This is a blameless analysis
- Focus on systems and processes, not individuals
- Ask "how did the system allow this?" not "who did this?"
- Identify actionable improvements
- Share learnings openly`,
  },

  // Business Strategy Templates
  {
    id: 'template-product-strategy',
    name: 'Product Strategy',
    category: 'business',
    icon: '🎯',
    description: 'Define or refine product strategy with cross-functional input.',
    subject: 'Product Strategy Discussion',
    goal: 'Align on product direction, prioritize initiatives, and define success metrics.',
    mode: 'moderator',
    strategy: 'decision-matrix',
    recommendedPresets: [
      'preset-product-manager',
      'preset-software-architect',
      'preset-ux-designer',
    ],
  },
  {
    id: 'template-competitive-analysis',
    name: 'Competitive Analysis',
    category: 'business',
    icon: '🏆',
    description: 'Analyze competitive landscape and identify differentiation opportunities.',
    subject: 'Competitive Analysis',
    goal: 'Understand competitive positioning, identify threats and opportunities, and define differentiation strategy.',
    mode: 'round-robin',
    strategy: 'devils-advocate',
    recommendedPresets: [
      'preset-product-manager',
      'preset-financial-analyst',
    ],
  },
  {
    id: 'template-risk-assessment',
    name: 'Risk Assessment',
    category: 'business',
    icon: '⚠️',
    description: 'Identify, analyze, and prioritize risks with mitigation strategies.',
    subject: 'Risk Assessment Session',
    goal: 'Identify potential risks, assess likelihood and impact, and develop mitigation plans.',
    mode: 'round-robin',
    strategy: 'devils-advocate',
    recommendedPresets: [
      'preset-risk-manager',
      'preset-compliance-officer',
      'preset-software-architect',
      'preset-security-expert',
    ],
    openingStatement: `Let's systematically identify and assess risks:
- What could go wrong?
- How likely is each risk?
- What's the potential impact?
- How can we mitigate or prevent each risk?`,
  },

  // Finance Templates
  {
    id: 'template-investment-thesis',
    name: 'Investment Thesis',
    category: 'finance',
    icon: '📊',
    description: 'Develop and stress-test an investment thesis.',
    subject: 'Investment Thesis Development',
    goal: 'Build a compelling investment thesis with clear rationale, risks, and expected returns.',
    mode: 'round-robin',
    strategy: 'structured-debate',
    recommendedPresets: [
      'preset-portfolio-manager',
      'preset-financial-analyst',
      'preset-risk-manager',
      'preset-trader',
    ],
  },
  {
    id: 'template-portfolio-review',
    name: 'Portfolio Review',
    category: 'finance',
    icon: '💰',
    description: 'Review portfolio performance and rebalancing needs.',
    subject: 'Portfolio Review & Rebalancing',
    goal: 'Assess current portfolio performance, identify rebalancing opportunities, and align with risk tolerance.',
    mode: 'round-robin',
    strategy: 'expert-deep-dive',
    recommendedPresets: [
      'preset-portfolio-manager',
      'preset-financial-analyst',
      'preset-risk-manager',
      'preset-compliance-officer',
    ],
  },
  {
    id: 'template-market-analysis',
    name: 'Market Analysis',
    category: 'finance',
    icon: '📈',
    description: 'Analyze market conditions and identify opportunities.',
    subject: 'Market Analysis Session',
    goal: 'Understand current market dynamics, identify trends, and assess investment opportunities.',
    mode: 'dynamic',
    strategy: 'open-brainstorm',
    recommendedPresets: [
      'preset-trader',
      'preset-financial-analyst',
      'preset-portfolio-manager',
    ],
  },

  // Design Templates
  {
    id: 'template-design-critique',
    name: 'Design Critique',
    category: 'design',
    icon: '🎨',
    description: 'Constructive critique of design work from multiple perspectives.',
    subject: 'Design Critique Session',
    goal: 'Provide constructive feedback on design work, identify improvements, and ensure alignment with user needs.',
    mode: 'round-robin',
    strategy: 'structured-debate',
    recommendedPresets: [
      'preset-ux-designer',
      'preset-senior-frontend',
      'preset-product-manager',
    ],
    groundRules: `Design Critique Guidelines:
- Lead with what's working well
- Be specific and actionable in feedback
- Consider user perspective
- Separate personal preference from usability
- Suggest alternatives, not just problems`,
  },
  {
    id: 'template-user-journey',
    name: 'User Journey Mapping',
    category: 'design',
    icon: '🗺️',
    description: 'Map and optimize user journey through the product.',
    subject: 'User Journey Analysis',
    goal: 'Map the complete user journey, identify pain points, and design improvements.',
    mode: 'round-robin',
    strategy: 'problem-first',
    recommendedPresets: [
      'preset-ux-designer',
      'preset-product-manager',
      'preset-senior-frontend',
    ],
  },

  // General Templates
  {
    id: 'template-brainstorm',
    name: 'Open Brainstorm',
    category: 'general',
    icon: '💡',
    description: 'Free-form brainstorming session for generating ideas.',
    subject: 'Brainstorming Session',
    goal: 'Generate as many ideas as possible without judgment, then identify the most promising ones.',
    mode: 'dynamic',
    strategy: 'open-brainstorm',
    recommendedPresets: [],
  },
  {
    id: 'template-pros-cons',
    name: 'Pros & Cons Analysis',
    category: 'general',
    icon: '⚖️',
    description: 'Systematic analysis of advantages and disadvantages.',
    subject: 'Pros and Cons Analysis',
    goal: 'Thoroughly examine both sides of a decision to make an informed choice.',
    mode: 'round-robin',
    strategy: 'structured-debate',
    recommendedPresets: [],
  },
  {
    id: 'template-decision',
    name: 'Decision Workshop',
    category: 'general',
    icon: '🎯',
    description: 'Structured decision-making with multiple stakeholder perspectives.',
    subject: 'Decision Workshop',
    goal: 'Reach a well-reasoned decision by evaluating options against clear criteria.',
    mode: 'moderator',
    strategy: 'decision-matrix',
    recommendedPresets: [],
  },
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): ConversationTemplate[] {
  return conversationTemplates.filter(t => t.category === category);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): ConversationTemplate | undefined {
  return conversationTemplates.find(t => t.id === id);
}

/**
 * Get all templates grouped by category
 */
export function getTemplatesGroupedByCategory(): Map<TemplateCategory, ConversationTemplate[]> {
  const grouped = new Map<TemplateCategory, ConversationTemplate[]>();
  
  for (const category of templateCategories) {
    grouped.set(category.id, getTemplatesByCategory(category.id));
  }
  
  return grouped;
}

/**
 * Search templates by query
 */
export function searchTemplates(query: string): ConversationTemplate[] {
  const lowerQuery = query.toLowerCase();
  
  return conversationTemplates.filter(t => 
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.subject.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get recommended templates based on topic keywords
 */
export function getRecommendedTemplates(topic: string): ConversationTemplate[] {
  const lowerTopic = topic.toLowerCase();
  const scores: Array<{ template: ConversationTemplate; score: number }> = [];

  const keywordMap: Record<string, string[]> = {
    'template-architecture-review': ['architecture', 'system', 'design', 'scalability', 'microservice'],
    'template-code-review': ['code', 'review', 'pull request', 'pr', 'merge'],
    'template-feature-planning': ['feature', 'plan', 'scope', 'requirement'],
    'template-tech-debt': ['debt', 'refactor', 'legacy', 'cleanup'],
    'template-incident-postmortem': ['incident', 'outage', 'postmortem', 'failure', 'bug'],
    'template-product-strategy': ['product', 'strategy', 'roadmap', 'vision'],
    'template-competitive-analysis': ['competitor', 'competition', 'market share'],
    'template-risk-assessment': ['risk', 'threat', 'vulnerability', 'compliance'],
    'template-investment-thesis': ['investment', 'thesis', 'opportunity', 'stock'],
    'template-portfolio-review': ['portfolio', 'allocation', 'rebalance'],
    'template-market-analysis': ['market', 'trend', 'analysis', 'sector'],
    'template-design-critique': ['design', 'ui', 'ux', 'mockup', 'prototype'],
    'template-user-journey': ['journey', 'user flow', 'experience', 'onboarding'],
  };

  for (const template of conversationTemplates) {
    let score = 0;
    const keywords = keywordMap[template.id] || [];
    
    for (const keyword of keywords) {
      if (lowerTopic.includes(keyword)) {
        score += 2;
      }
    }

    // Category matching
    if (lowerTopic.includes(template.category)) {
      score += 1;
    }

    if (score > 0) {
      scores.push({ template, score });
    }
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.template);
}

