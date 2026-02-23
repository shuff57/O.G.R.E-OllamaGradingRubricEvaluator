import { describe, it, expect } from 'vitest';
import { getSkillSourceLabel, getSkillSourceClass, toggleSkillActiveValue } from '../../../lib/skill-utils';
import type { Skill } from '../../../lib/db';

describe('Skill Logic', () => {
  const baseSkill: Skill = {
    id: '1',
    name: 'Test',
    description: 'Desc',
    content: 'Content',
    source: null,
    source_id: null,
    is_active: 1,
    created_at: '',
    updated_at: ''
  };

  describe('getSkillSourceLabel', () => {
    it('returns Local for source=local', () => {
      expect(getSkillSourceLabel({ ...baseSkill, source: 'local' })).toBe('Local');
    });

    it('returns Created for source=null', () => {
      expect(getSkillSourceLabel({ ...baseSkill, source: null })).toBe('Created');
    });

    it('returns Created for source=created', () => {
      expect(getSkillSourceLabel({ ...baseSkill, source: 'created' })).toBe('Created');
    });

    it('returns Marketplace for other sources', () => {
      expect(getSkillSourceLabel({ ...baseSkill, source: 'marketplace' })).toBe('Marketplace');
    });
  });

  describe('getSkillSourceClass', () => {
    it('returns badge-local for source=local', () => {
      expect(getSkillSourceClass({ ...baseSkill, source: 'local' })).toBe('badge-local');
    });

    it('returns badge-created for source=null', () => {
      expect(getSkillSourceClass({ ...baseSkill, source: null })).toBe('badge-created');
    });

    it('returns badge-created for source=created', () => {
      expect(getSkillSourceClass({ ...baseSkill, source: 'created' })).toBe('badge-created');
    });

    it('returns badge-marketplace for other sources', () => {
      expect(getSkillSourceClass({ ...baseSkill, source: 'marketplace' })).toBe('badge-marketplace');
    });
  });

  describe('toggleSkillActiveValue', () => {
    it('toggles 1 to 0', () => {
      expect(toggleSkillActiveValue(1)).toBe(0);
    });

    it('toggles 0 to 1', () => {
      expect(toggleSkillActiveValue(0)).toBe(1);
    });
  });
});
