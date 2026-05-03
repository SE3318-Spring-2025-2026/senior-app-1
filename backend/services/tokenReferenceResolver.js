const ApiError = require('../errors/apiError');

function asTrimmedString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function sanitizeReferenceKey(value) {
  return asTrimmedString(value)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function parseReferenceMap(rawValue) {
  const normalized = asTrimmedString(rawValue);
  if (!normalized) {
    return {};
  }

  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    return {};
  }
}

function resolveFromEnvironment(tokenRef, provider) {
  const normalizedRef = asTrimmedString(tokenRef);
  const normalizedProvider = asTrimmedString(provider).toUpperCase();
  const sanitizedRef = sanitizeReferenceKey(normalizedRef);

  const exactKey = process.env[`TOKEN_REF_${sanitizedRef}`];
  if (asTrimmedString(exactKey)) {
    return exactKey.trim();
  }

  const providerSpecificKey = process.env[`${normalizedProvider}_TOKEN_REF_${sanitizedRef}`];
  if (asTrimmedString(providerSpecificKey)) {
    return providerSpecificKey.trim();
  }

  const sharedMap = parseReferenceMap(process.env.TOKEN_REFERENCE_MAP);
  if (asTrimmedString(sharedMap[normalizedRef])) {
    return sharedMap[normalizedRef].trim();
  }

  const providerMap = parseReferenceMap(process.env[`${normalizedProvider}_TOKEN_REFERENCE_MAP`]);
  if (asTrimmedString(providerMap[normalizedRef])) {
    return providerMap[normalizedRef].trim();
  }

  return null;
}

function resolveTokenReference(tokenRef, { provider }) {
  const normalizedRef = asTrimmedString(tokenRef);
  const normalizedProvider = asTrimmedString(provider).toUpperCase();

  if (!normalizedRef) {
    throw ApiError.conflict(
      `${normalizedProvider}_TOKEN_REFERENCE_NOT_FOUND`,
      `No ${normalizedProvider} token reference exists for this team`,
    );
  }

  const resolvedSecret = resolveFromEnvironment(normalizedRef, normalizedProvider);
  if (resolvedSecret) {
    return resolvedSecret;
  }

  console.warn(`${normalizedProvider} token reference could not be resolved`, {
    tokenRef: normalizedRef,
  });

  throw ApiError.conflict(
    `${normalizedProvider}_TOKEN_SECRET_NOT_RESOLVED`,
    `No ${normalizedProvider} secret is configured for this team`,
  );
}

module.exports = {
  resolveTokenReference,
};
