const DEFAULT_FETCH_RETRIES = 2;
const DEFAULT_FETCH_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

function createExternalApiError(serviceName, operation, response) {
  const statusCode = response && response.getResponseCode ? response.getResponseCode() : 0;
  const body = response && response.getContentText ? response.getContentText() : '';
  const error = new Error(serviceName + ' failed during ' + operation + ' with status ' + statusCode);
  error.name = 'ExternalApiError';
  error.code = 'EXTERNAL_API_ERROR';
  error.serviceName = serviceName;
  error.operation = operation;
  error.statusCode = statusCode;
  error.responseBody = body;
  return error;
}

function shouldRetryStatus(statusCode, retryStatuses) {
  return retryStatuses.indexOf(statusCode) !== -1;
}

function fetchWithRetry(url, options, requestOptions) {
  const opts = options || {};
  const meta = requestOptions || {};
  const retries = meta.retries === undefined ? DEFAULT_FETCH_RETRIES : meta.retries;
  const retryStatuses = meta.retryStatuses || DEFAULT_FETCH_RETRY_STATUSES;
  const serviceName = meta.serviceName || 'UrlFetchApp';
  const operation = meta.operation || url;
  const fetchOptions = Object.assign({ muteHttpExceptions: true }, opts);
  let lastResponse = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      lastResponse = UrlFetchApp.fetch(url, fetchOptions);
    } catch (err) {
      if (attempt >= retries) {
        throw createServiceUnavailableError(serviceName, operation, err);
      }
      Utilities.sleep(250 * (attempt + 1));
      continue;
    }

    if (attempt >= retries || !shouldRetryStatus(lastResponse.getResponseCode(), retryStatuses)) {
      return lastResponse;
    }

    Utilities.sleep(250 * (attempt + 1));
  }

  return lastResponse;
}

function fetchJsonWithRetry(url, options, requestOptions) {
  const response = fetchWithRetry(url, options, requestOptions);
  const body = response.getContentText();

  if (!body) return null;

  try {
    return JSON.parse(body);
  } catch (err) {
    throw createServiceUnavailableError(
      (requestOptions && requestOptions.serviceName) || 'UrlFetchApp',
      ((requestOptions && requestOptions.operation) || url) + ' parse json',
      err
    );
  }
}
