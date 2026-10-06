import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../load-env.mjs';
test('loads example-style env, quoted values and comments without executing shell code', () => {
  assert.deepEqual(parseEnv('# comment\r\nIMAGE_PROVIDER=ark\r\nARK_API_KEY="test-key"\nPORT=3000 # comment\nEMPTY=\nLITERAL=$(echo value)\n'), {IMAGE_PROVIDER:'ark',ARK_API_KEY:'test-key',PORT:'3000',EMPTY:'',LITERAL:'$(echo value)'});
});
