import type { Skill } from './db';

export function getSkillSourceLabel(skill: Skill): string {
  if (skill.source === 'local') return 'Local';
  if (!skill.source || skill.source === 'created') return 'Created';
  return 'Marketplace';
}

export function getSkillSourceClass(skill: Skill): string {
  if (skill.source === 'local') return 'badge-local';
  if (!skill.source || skill.source === 'created') return 'badge-created';
  return 'badge-marketplace';
}

export function toggleSkillActiveValue(currentValue: number): number {
  return currentValue === 1 ? 0 : 1;
}
