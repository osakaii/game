import { describe, expect, it } from 'vitest';
import { JoinRoomSchema, NicknameSchema } from '../src/lobby.js';

describe('lobby schemas', () => {
  it('trims nickname', () => {
    expect(NicknameSchema.parse('  Alex ')).toBe('Alex');
  });

  it('rejects empty and too long nicknames', () => {
    expect(NicknameSchema.safeParse('   ').success).toBe(false);
    expect(NicknameSchema.safeParse('x'.repeat(17)).success).toBe(false);
  });

  it('rejects invisible control characters', () => {
    expect(NicknameSchema.safeParse('Ad‮min').success).toBe(false);
  });

  it('normalizes room code to upper case', () => {
    const result = JoinRoomSchema.parse({ nickname: 'Bob', code: ' kx7p ' });
    expect(result.code).toBe('KX7P');
  });

  it('rejects ambiguous characters in room code', () => {
    expect(JoinRoomSchema.safeParse({ nickname: 'Bob', code: 'O0I1' }).success).toBe(false);
  });
});
