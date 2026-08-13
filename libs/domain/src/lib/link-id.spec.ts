import { linkId } from './link-id.js';
import { InvalidLinkIdError } from './errors.js';

describe('linkId', () => {
  it('constructs a branded id from a non-empty string', () => {
    const id = linkId('link-0001');
    expect(id).toBe('link-0001');
    expect(typeof id).toBe('string');
  });

  it('trims surrounding whitespace', () => {
    expect(linkId('  link-0002  ')).toBe('link-0002');
  });

  it('throws InvalidLinkIdError for an empty string', () => {
    expect(() => linkId('')).toThrow(InvalidLinkIdError);
  });

  it('throws InvalidLinkIdError for a whitespace-only string', () => {
    expect(() => linkId('   ')).toThrow(InvalidLinkIdError);
  });

  it('exposes the offending raw value on the error', () => {
    try {
      linkId('   ');
      fail('expected linkId to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidLinkIdError);
      expect((error as InvalidLinkIdError).raw).toBe('   ');
    }
  });
});
