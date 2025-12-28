// ============================================
// AI Brainstorm - Agent Presets Index
// Version: 1.2.0
// ============================================

import { softwarePresets } from './software-presets';
import { financePresets } from './finance-presets';
import { generalPresets } from './general-presets';
import { presetStorage } from '../../storage/storage-manager';
import type { AgentPreset } from '../../types';

// All built-in presets
export const builtInPresets: AgentPreset[] = [
  ...softwarePresets,
  ...financePresets,
  ...generalPresets,
];

// Preset categories
export const presetCategories = [
  { id: 'general', name: 'General Purpose', icon: '🎯' },
  { id: 'software', name: 'Software Development', icon: '💻' },
  { id: 'finance', name: 'Finance & Trading', icon: '📈' },
  { id: 'design', name: 'Design', icon: '🎨' },
  { id: 'data', name: 'Data & ML', icon: '📊' },
  { id: 'business', name: 'Business', icon: '💼' },
  { id: 'leadership', name: 'Leadership', icon: '👔' },
  { id: 'documentation', name: 'Documentation', icon: '📝' },
  { id: 'custom', name: 'Custom', icon: '⚙️' },
];

/**
 * Initialize built-in presets in the database
 */
export async function initializePresets(): Promise<void> {
  const existingPresets = await presetStorage.getBuiltIn();
  const existingIds = new Set(existingPresets.map(p => p.id));

  // Add missing built-in presets
  const missingPresets = builtInPresets.filter(p => !existingIds.has(p.id));

  if (missingPresets.length > 0) {
    await presetStorage.bulkPut(missingPresets);
    console.log(`[Presets] Added ${missingPresets.length} built-in presets`);
  }

  // Update existing built-in presets if they've changed
  for (const preset of builtInPresets) {
    if (existingIds.has(preset.id)) {
      await presetStorage.bulkPut([preset]);
    }
  }

  console.log(`[Presets] Initialized ${builtInPresets.length} built-in presets`);
}

/**
 * Get presets by category
 */
export async function getPresetsByCategory(category: string): Promise<AgentPreset[]> {
  const all = await presetStorage.getAll();
  return all.filter(p => p.category === category);
}

/**
 * Search presets by name or expertise
 */
export async function searchPresets(query: string): Promise<AgentPreset[]> {
  const all = await presetStorage.getAll();
  const lowerQuery = query.toLowerCase();

  return all.filter(p =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.expertise.toLowerCase().includes(lowerQuery) ||
    p.description.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get recommended presets for a topic
 */
export function getRecommendedPresets(topic: string): AgentPreset[] {
  const lowerTopic = topic.toLowerCase();
  const recommendations: Array<{ preset: AgentPreset; score: number }> = [];

  for (const preset of builtInPresets) {
    let score = 0;

    // Check if expertise matches topic
    const expertiseWords = preset.expertise.toLowerCase().split(/[,\s]+/);
    for (const word of expertiseWords) {
      if (lowerTopic.includes(word) && word.length > 3) {
        score += 2;
      }
    }

    // Check if name matches
    if (lowerTopic.includes(preset.name.toLowerCase())) {
      score += 3;
    }

    // Check category keywords
    const categoryKeywords: Record<string, string[]> = {
      general: ['brainstorm', 'think', 'idea', 'discuss', 'debate', 'general', 'strategy', 'creative', 'challenge'],
      software: ['app', 'web', 'code', 'software', 'develop', 'programming', 'api'],
      finance: ['finance', 'trading', 'investment', 'portfolio', 'risk', 'market', 'fund', 'stock', 'asset'],
      design: ['design', 'ui', 'ux', 'user', 'interface', 'experience'],
      data: ['data', 'ml', 'machine learning', 'analytics', 'ai', 'model'],
      business: ['business', 'product', 'requirements', 'stakeholder'],
      leadership: ['strategy', 'team', 'organization', 'vision'],
    };

    const categoryKws = categoryKeywords[preset.category] || [];
    for (const kw of categoryKws) {
      if (lowerTopic.includes(kw)) {
        score += 1;
      }
    }

    if (score > 0) {
      recommendations.push({ preset, score });
    }
  }

  // Sort by score and return top presets
  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(r => r.preset);
}

/**
 * Create a balanced team for a software project discussion
 */
export function getSoftwareTeamPresets(): AgentPreset[] {
  return builtInPresets.filter(p =>
    ['preset-software-architect', 'preset-senior-frontend', 'preset-senior-backend', 'preset-devops-engineer', 'preset-product-manager'].includes(p.id)
  );
}

/**
 * Create a security-focused team
 */
export function getSecurityTeamPresets(): AgentPreset[] {
  return builtInPresets.filter(p =>
    ['preset-security-expert', 'preset-software-architect', 'preset-devops-engineer', 'preset-senior-backend'].includes(p.id)
  );
}

/**
 * Create a full-stack development team
 */
export function getFullStackTeamPresets(): AgentPreset[] {
  return builtInPresets.filter(p =>
    ['preset-senior-frontend', 'preset-senior-backend', 'preset-database-expert', 'preset-qa-engineer', 'preset-ux-designer'].includes(p.id)
  );
}

/**
 * Create a finance/investment team
 */
export function getFinanceTeamPresets(): AgentPreset[] {
  return builtInPresets.filter(p =>
    ['preset-portfolio-manager', 'preset-financial-analyst', 'preset-risk-manager', 'preset-trader', 'preset-compliance-officer'].includes(p.id)
  );
}

/**
 * Create a general brainstorming team with diverse thinking styles
 */
export function getGeneralTeamPresets(): AgentPreset[] {
  return builtInPresets.filter(p =>
    ['preset-devils-advocate', 'preset-optimist', 'preset-brainstormer', 'preset-synthesizer', 'preset-strategic-coach'].includes(p.id)
  );
}

/**
 * Create a critical thinking team for thorough analysis
 */
export function getCriticalThinkingTeamPresets(): AgentPreset[] {
  return builtInPresets.filter(p =>
    ['preset-devils-advocate', 'preset-skeptic', 'preset-researcher', 'preset-mediator'].includes(p.id)
  );
}

export { softwarePresets, financePresets, generalPresets };

