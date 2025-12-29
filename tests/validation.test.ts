// ============================================
// AI Brainstorm - Validation Tests
// ============================================

import { describe, it, expect } from 'vitest';
import {
  validateField,
  validateSubject,
  validateGoal,
  validateAgentName,
  validateAgentRole,
  validateUrl,
  validateNumber,
  validateAgentCount,
  sanitizeHtml,
  sanitizeInput,
  validateForm,
} from '../src/utils/validation';

describe('validateField', () => {
  describe('required validation', () => {
    it('should fail for empty string when required', () => {
      const result = validateField('', { required: true });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This field is required');
    });

    it('should fail for whitespace-only string when required', () => {
      const result = validateField('   ', { required: true });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This field is required');
    });

    it('should fail for null when required', () => {
      const result = validateField(null, { required: true });
      expect(result.valid).toBe(false);
    });

    it('should pass for non-empty string when required', () => {
      const result = validateField('hello', { required: true });
      expect(result.valid).toBe(true);
    });

    it('should pass for empty string when not required', () => {
      const result = validateField('', { required: false });
      expect(result.valid).toBe(true);
    });
  });

  describe('length validation', () => {
    it('should fail when below minimum length', () => {
      const result = validateField('ab', { minLength: 3 });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must be at least 3 characters');
    });

    it('should pass when at minimum length', () => {
      const result = validateField('abc', { minLength: 3 });
      expect(result.valid).toBe(true);
    });

    it('should fail when above maximum length', () => {
      const result = validateField('abcdef', { maxLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must be no more than 5 characters');
    });

    it('should pass when at maximum length', () => {
      const result = validateField('abcde', { maxLength: 5 });
      expect(result.valid).toBe(true);
    });
  });

  describe('pattern validation', () => {
    it('should fail when pattern does not match', () => {
      const result = validateField('abc123', { pattern: /^[a-z]+$/ });
      expect(result.valid).toBe(false);
    });

    it('should pass when pattern matches', () => {
      const result = validateField('abc', { pattern: /^[a-z]+$/ });
      expect(result.valid).toBe(true);
    });

    it('should use custom pattern message', () => {
      const result = validateField('abc123', {
        pattern: /^[a-z]+$/,
        patternMessage: 'Only lowercase letters allowed',
      });
      expect(result.error).toBe('Only lowercase letters allowed');
    });
  });

  describe('custom validation', () => {
    it('should use custom validation function', () => {
      const result = validateField('test', {
        custom: (value) => ({
          valid: value.length > 5,
          error: 'Must be longer than 5 characters',
        }),
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Must be longer than 5 characters');
    });
  });
});

describe('validateSubject', () => {
  it('should fail for empty subject', () => {
    const result = validateSubject('');
    expect(result.valid).toBe(false);
  });

  it('should fail for subject shorter than 3 characters', () => {
    const result = validateSubject('ab');
    expect(result.valid).toBe(false);
  });

  it('should pass for valid subject', () => {
    const result = validateSubject('Test Conversation Subject');
    expect(result.valid).toBe(true);
  });

  it('should fail for subject longer than 200 characters', () => {
    const result = validateSubject('a'.repeat(201));
    expect(result.valid).toBe(false);
  });
});

describe('validateGoal', () => {
  it('should fail for empty goal', () => {
    const result = validateGoal('');
    expect(result.valid).toBe(false);
  });

  it('should fail for goal shorter than 10 characters', () => {
    const result = validateGoal('short');
    expect(result.valid).toBe(false);
  });

  it('should pass for valid goal', () => {
    const result = validateGoal('This is a valid conversation goal that explains the objective clearly.');
    expect(result.valid).toBe(true);
  });
});

describe('validateAgentName', () => {
  it('should fail for empty name', () => {
    const result = validateAgentName('');
    expect(result.valid).toBe(false);
  });

  it('should fail for name with special characters', () => {
    const result = validateAgentName('Agent@#$');
    expect(result.valid).toBe(false);
  });

  it('should pass for valid agent name', () => {
    const result = validateAgentName('AI Assistant');
    expect(result.valid).toBe(true);
  });

  it('should allow hyphens and underscores', () => {
    const result = validateAgentName('AI-Assistant_1');
    expect(result.valid).toBe(true);
  });
});

describe('validateUrl', () => {
  it('should fail for empty URL', () => {
    const result = validateUrl('');
    expect(result.valid).toBe(false);
  });

  it('should fail for invalid URL format', () => {
    const result = validateUrl('not-a-url');
    expect(result.valid).toBe(false);
  });

  it('should pass for valid HTTP URL', () => {
    const result = validateUrl('http://example.com');
    expect(result.valid).toBe(true);
  });

  it('should pass for valid HTTPS URL', () => {
    const result = validateUrl('https://api.example.com/v1');
    expect(result.valid).toBe(true);
  });
});

describe('validateNumber', () => {
  it('should fail for null', () => {
    const result = validateNumber(null);
    expect(result.valid).toBe(false);
  });

  it('should fail for NaN', () => {
    const result = validateNumber(NaN);
    expect(result.valid).toBe(false);
  });

  it('should fail when below minimum', () => {
    const result = validateNumber(5, { min: 10 });
    expect(result.valid).toBe(false);
  });

  it('should fail when above maximum', () => {
    const result = validateNumber(15, { max: 10 });
    expect(result.valid).toBe(false);
  });

  it('should fail for non-integer when integer required', () => {
    const result = validateNumber(5.5, { integer: true });
    expect(result.valid).toBe(false);
  });

  it('should pass for valid number within range', () => {
    const result = validateNumber(5, { min: 1, max: 10 });
    expect(result.valid).toBe(true);
  });
});

describe('validateAgentCount', () => {
  it('should fail for less than 2 agents', () => {
    const result = validateAgentCount(1);
    expect(result.valid).toBe(false);
  });

  it('should fail for more than 10 agents', () => {
    const result = validateAgentCount(11);
    expect(result.valid).toBe(false);
  });

  it('should pass for 2-10 agents', () => {
    expect(validateAgentCount(2).valid).toBe(true);
    expect(validateAgentCount(5).valid).toBe(true);
    expect(validateAgentCount(10).valid).toBe(true);
  });
});

describe('sanitizeHtml', () => {
  it('should escape HTML tags', () => {
    const result = sanitizeHtml('<script>alert("xss")</script>');
    expect(result).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
  });

  it('should escape special characters', () => {
    const result = sanitizeHtml('Hello & World');
    expect(result).toBe('Hello &amp; World');
  });

  it('should preserve normal text', () => {
    const result = sanitizeHtml('Hello World');
    expect(result).toBe('Hello World');
  });
});

describe('sanitizeInput', () => {
  it('should trim and sanitize input', () => {
    const result = sanitizeInput('  <b>Hello</b>  ');
    expect(result).toBe('&lt;b&gt;Hello&lt;/b&gt;');
  });

  it('should handle null input', () => {
    const result = sanitizeInput(null);
    expect(result).toBe('');
  });
});

describe('validateForm', () => {
  it('should validate all fields and return errors', () => {
    const result = validateForm({
      subject: { value: '', validate: validateSubject },
      goal: { value: 'short', validate: validateGoal },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.subject).toBeDefined();
    expect(result.errors.goal).toBeDefined();
  });

  it('should pass when all fields are valid', () => {
    const result = validateForm({
      subject: { value: 'Valid Subject', validate: validateSubject },
      goal: { value: 'This is a valid goal with enough characters', validate: validateGoal },
    });

    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });
});

