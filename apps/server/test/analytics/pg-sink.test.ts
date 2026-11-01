import { describe, expect, it } from 'vitest';
import { insertQuery } from '../../src/analytics/pg-sink';

describe('insertQuery', () => {
  it('sends a whole batch as six array parameters: values never become part of the SQL text', () => {
    const nickname = "Robert'); DROP TABLE events;--";
    const query = insertQuery([
      { type: 'room_created', player: 'k1', room: 'ABCD', data: { nickname }, at: new Date(1000), version: '1.6.0' },
      { type: 'player_seen', at: new Date(2000), version: '1.6.0' },
    ]);
    expect(query.text).not.toContain('DROP');
    expect(query.text).toContain('unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::jsonb[])');
    expect(query.values).toEqual([
      [new Date(1000), new Date(2000)],
      ['room_created', 'player_seen'],
      ['k1', null],
      ['ABCD', null],
      ['1.6.0', '1.6.0'],
      [JSON.stringify({ nickname }), '{}'],
    ]);
  });
});
