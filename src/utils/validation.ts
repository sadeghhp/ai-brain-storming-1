// ============================================
// AI Brainstorm - Input Validation Utilities
// ============================================

/**
 * Validation result with error message
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Field validation rules
 */
export interface ValidationRules {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  custom?: (value: string) => ValidationResult;
}

/**
 * Validate a string value against rules
 */
export function validateField(value: string | null | undefined, rules: ValidationRules): ValidationResult {
  const trimmed = (value ?? '').trim();

  // Required check
  if (rules.required && !trimmed) {
    return { valid: false, error: 'This field is required' };
  }

  // Skip other checks if empty and not required
  if (!trimmed) {
    return { valid: true };
  }

  // Min length
  if (rules.minLength !== undefined && trimmed.length < rules.minLength) {
    return { valid: false, error: `Must be at least ${rules.minLength} characters` };
  }

  // Max length
  if (rules.maxLength !== undefined && trimmed.length > rules.maxLength) {
    return { valid: false, error: `Must be no more than ${rules.maxLength} characters` };
  }

  // Pattern
  if (rules.pattern && !rules.pattern.test(trimmed)) {
    return { valid: false, error: rules.patternMessage || 'Invalid format' };
  }

  // Custom validation
  if (rules.custom) {
    return rules.custom(trimmed);
  }

  return { valid: true };
}

/**
 * Validate conversation subject
 */
export function validateSubject(subject: string | null | undefined): ValidationResult {
  return validateField(subject, {
    required: true,
    minLength: 3,
    maxLength: 200,
  });
}

/**
 * Validate conversation goal
 */
export function validateGoal(goal: string | null | undefined): ValidationResult {
  return validateField(goal, {
    required: true,
    minLength: 10,
    maxLength: 2000,
  });
}

/**
 * Validate agent name
 */
export function validateAgentName(name: string | null | undefined): ValidationResult {
  return validateField(name, {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9\s\-_]+$/,
    patternMessage: 'Only letters, numbers, spaces, hyphens, and underscores allowed',
  });
}

/**
 * Validate agent role
 */
export function validateAgentRole(role: string | null | undefined): ValidationResult {
  return validateField(role, {
    required: true,
    minLength: 3,
    maxLength: 100,
  });
}

/**
 * Validate agent expertise
 */
export function validateAgentExpertise(expertise: string | null | undefined): ValidationResult {
  return validateField(expertise, {
    minLength: 5,
    maxLength: 500,
  });
}

/**
 * Validate system prompt
 */
export function validateSystemPrompt(prompt: string | null | undefined): ValidationResult {
  return validateField(prompt, {
    maxLength: 10000,
    custom: (value) => {
      // Check for potentially harmful content
      const harmfulPatterns = [
        /ignore previous instructions/i,
        /disregard all previous/i,
        /forget everything/i,
      ];
      
      for (const pattern of harmfulPatterns) {
        if (pattern.test(value)) {
          return { valid: false, error: 'System prompt contains potentially harmful content' };
        }
      }
      
      return { valid: true };
    },
  });
}

/**
 * Validate URL
 */
export function validateUrl(url: string | null | undefined): ValidationResult {
  return validateField(url, {
    required: true,
    pattern: /^https?:\/\/.+/,
    patternMessage: 'Must be a valid HTTP or HTTPS URL',
  });
}

/**
 * Validate API key (basic check for non-empty)
 */
export function validateApiKey(key: string | null | undefined): ValidationResult {
  return validateField(key, {
    minLength: 10,
    custom: (value) => {
      // Basic check that it looks like an API key
      if (!/^[a-zA-Z0-9\-_]+$/.test(value)) {
        return { valid: false, error: 'Invalid API key format' };
      }
      return { valid: true };
    },
  });
}

/**
 * Validate a number value
 */
export function validateNumber(
  value: number | null | undefined,
  options: { min?: number; max?: number; integer?: boolean } = {}
): ValidationResult {
  if (value === null || value === undefined || isNaN(value)) {
    return { valid: false, error: 'Must be a number' };
  }

  if (options.integer && !Number.isInteger(value)) {
    return { valid: false, error: 'Must be a whole number' };
  }

  if (options.min !== undefined && value < options.min) {
    return { valid: false, error: `Must be at least ${options.min}` };
  }

  if (options.max !== undefined && value > options.max) {
    return { valid: false, error: `Must be no more than ${options.max}` };
  }

  return { valid: true };
}

/**
 * Validate agent count
 */
export function validateAgentCount(count: number): ValidationResult {
  return validateNumber(count, { min: 2, max: 10, integer: true });
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Sanitize and trim input
 */
export function sanitizeInput(input: string | null | undefined): string {
  return sanitizeHtml((input ?? '').trim());
}

/**
 * Validate a form with multiple fields
 */
export function validateForm(
  fields: Record<string, { value: string | number; validate: (v: any) => ValidationResult }>
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let valid = true;

  for (const [name, { value, validate }] of Object.entries(fields)) {
    const result = validate(value);
    if (!result.valid) {
      valid = false;
      errors[name] = result.error || 'Invalid value';
    }
  }

  return { valid, errors };
}

