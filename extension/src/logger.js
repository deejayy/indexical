const NAMESPACE = "indexical";

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

let currentLogLevel = LOG_LEVELS.info;

function safeStringify(obj, maxDepth = 3) {
  const seen = new WeakSet();
  
  const stringify = (value, depth) => {
    if (depth > maxDepth) return '[Max Depth]';
    
    if (value === null) return null;
    if (value === undefined) return undefined;
    
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return value;
    }
    
    if (value instanceof Error) {
      return {
        message: value.message,
        stack: value.stack,
        name: value.name
      };
    }
    
    if (type === 'function') return '[Function]';
    
    if (Array.isArray(value)) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      return value.map(item => stringify(item, depth + 1));
    }
    
    if (type === 'object') {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      
      const result = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          result[key] = stringify(value[key], depth + 1);
        }
      }
      return result;
    }
    
    return value;
  };
  
  return stringify(obj, 0);
}

function formatLog(level, service, data) {
  const logEntry = {
    level,
    ts: new Date().toISOString(),
    namespace: NAMESPACE,
    service,
    ...safeStringify(data)
  };
  
  return JSON.stringify(logEntry);
}

function shouldLog(level) {
  return LOG_LEVELS[level] >= currentLogLevel;
}

function createLogger(service) {
  return {
    debug(data) {
      if (shouldLog('debug')) {
        console.log(formatLog('debug', service, data));
      }
    },
    
    info(data) {
      if (shouldLog('info')) {
        console.log(formatLog('info', service, data));
      }
    },
    
    warn(data) {
      if (shouldLog('warn')) {
        console.warn(formatLog('warn', service, data));
      }
    },
    
    error(data) {
      if (shouldLog('error')) {
        console.error(formatLog('error', service, data));
      }
    }
  };
}

function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    currentLogLevel = LOG_LEVELS[level];
  }
}

function generateRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 0xFFFFFFFF);
  return encodeBase62(timestamp) + encodeBase62(random);
}

function encodeBase62(num) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  let n = num;
  
  if (n === 0) return '0';
  
  while (n > 0) {
    result = chars[n % 62] + result;
    n = Math.floor(n / 62);
  }
  
  return result;
}

function generateRandomHex(bytes) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  
  let result = '';
  for (let i = 0; i < bytes * 2; i++) {
    result += Math.floor(Math.random() * 16).toString(16);
  }
  return result;
}

function generateTraceParent() {
  const version = '00';
  const traceId = generateRandomHex(16);
  const spanId = generateRandomHex(8);
  const flags = '01';
  
  return `${version}-${traceId}-${spanId}-${flags}`;
}

function parseTraceParent(traceparent) {
  if (!traceparent || typeof traceparent !== 'string') {
    return null;
  }
  
  const parts = traceparent.split('-');
  if (parts.length !== 4) {
    return null;
  }
  
  const [version, traceId, parentId, flags] = parts;
  
  if (version !== '00' || traceId.length !== 32 || parentId.length !== 16) {
    return null;
  }
  
  return { version, traceId, parentId, flags };
}

function generateChildSpan(traceparent) {
  const parsed = parseTraceParent(traceparent);
  if (!parsed) {
    return generateTraceParent();
  }
  
  const newSpanId = generateRandomHex(8);
  return `${parsed.version}-${parsed.traceId}-${newSpanId}-${parsed.flags}`;
}

