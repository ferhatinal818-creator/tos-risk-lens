// Küçük, eval()-siz JSON Schema doğrulayıcı (MV3 CSP "unsafe-eval" yasakladığı için Ajv çalışma
// zamanında kullanılmaz; testlerde Ajv ile çapraz doğrulanır).
// Desteklenen alt küme: type, enum, required, properties, additionalProperties:false,
// items, minLength/maxLength, minimum/maximum, maxItems.

export function validateSchema(schema, data, path = '$', errors = []) {
  const t = schema.type;
  const typeOk =
    t === 'object' ? data !== null && typeof data === 'object' && !Array.isArray(data)
    : t === 'array' ? Array.isArray(data)
    : t === 'string' ? typeof data === 'string'
    : t === 'number' ? typeof data === 'number' && Number.isFinite(data)
    : t === 'integer' ? Number.isInteger(data)
    : t === 'boolean' ? typeof data === 'boolean'
    : true;
  if (!typeOk) { errors.push({ path, code: 'type', message: `beklenen tür: ${t}` }); return errors; }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path, code: 'enum', message: `izin verilen değerlerden biri değil` });
  }
  if (t === 'string') {
    if (schema.minLength != null && data.length < schema.minLength) errors.push({ path, code: 'minLength', message: `en az ${schema.minLength} karakter` });
    if (schema.maxLength != null && data.length > schema.maxLength) errors.push({ path, code: 'maxLength', message: `en fazla ${schema.maxLength} karakter` });
  }
  if (t === 'number' || t === 'integer') {
    if (schema.minimum != null && data < schema.minimum) errors.push({ path, code: 'minimum', message: `>= ${schema.minimum}` });
    if (schema.maximum != null && data > schema.maximum) errors.push({ path, code: 'maximum', message: `<= ${schema.maximum}` });
  }
  if (t === 'array') {
    if (schema.maxItems != null && data.length > schema.maxItems) errors.push({ path, code: 'maxItems', message: `en fazla ${schema.maxItems} öğe` });
    if (schema.items) data.forEach((d, i) => validateSchema(schema.items, d, `${path}[${i}]`, errors));
  }
  if (t === 'object') {
    for (const k of schema.required || []) {
      if (!(k in data)) errors.push({ path: `${path}.${k}`, code: 'required', message: 'zorunlu alan eksik' });
    }
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(data)) {
      if (k in props) validateSchema(props[k], v, `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push({ path: `${path}.${k}`, code: 'additionalProperties', message: 'şemada olmayan alan' });
    }
  }
  return errors;
}
