import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const ajv = new Ajv2020({ strict: false, allErrors: true });
for (const name of ['result', 'job', 'diff', 'validation']) {
  const schema = JSON.parse(readFileSync(new URL('../../schemas/' + name + '.schema.json', import.meta.url), 'utf8'));
  ajv.addSchema(schema, name + '.schema.json');
}
export function contract(name, value) {
  const validate = ajv.getSchema(name + '.schema.json');
  assert(validate(value), name + ' 合同不匹配：' + JSON.stringify(validate.errors));
}
