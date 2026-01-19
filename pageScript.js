// Page script - runs in the page context to access cookies and make authenticated requests
(function() {
  'use strict';
  
  // Store for captured auth headers
  let authHeaders = null;
  let headersReady = false;
  
  // Request queue to batch requests and avoid rate limits
  const requestQueue = [];
  let isProcessingQueue = false;
  const MIN_REQUEST_INTERVAL = 200; // 200ms between requests to avoid 429
  let lastRequestTime = 0;
  
  // Intercept XHR to capture auth headers
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  
  const capturedHeaders = {};
  
  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    this._headers = {};
    return originalXhrOpen.apply(this, arguments);
  };
  
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this._headers) {
      this._headers[name.toLowerCase()] = value;
    }
    
    // Capture Twitter auth headers
    const lowerName = name.toLowerCase();
    if (lowerName === 'authorization' || lowerName === 'x-csrf-token' || lowerName.startsWith('x-')) {
      capturedHeaders[lowerName] = value;
      
      // Check if we have the essential headers
      if (capturedHeaders['authorization'] && capturedHeaders['x-csrf-token']) {
        authHeaders = { ...capturedHeaders };
        headersReady = true;
      }
    }
    
    return originalXhrSetRequestHeader.apply(this, arguments);
  };
  
  // Also intercept fetch for headers
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    if (init && init.headers) {
      const headers = init.headers;
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'authorization' || lowerKey === 'x-csrf-token' || lowerKey.startsWith('x-')) {
            capturedHeaders[lowerKey] = value;
          }
        });
      } else if (typeof headers === 'object') {
        Object.entries(headers).forEach(([key, value]) => {
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'authorization' || lowerKey === 'x-csrf-token' || lowerKey.startsWith('x-')) {
            capturedHeaders[lowerKey] = value;
          }
        });
      }
      
      if (capturedHeaders['authorization'] && capturedHeaders['x-csrf-token']) {
        authHeaders = { ...capturedHeaders };
        headersReady = true;
      }
    }
    return originalFetch.apply(this, arguments);
  };
  
  // Try to get CSRF token from cookies
  function getCsrfToken() {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'ct0') {
        return value;
      }
    }
    return null;
  }
  
  // Initialize headers from cookies if possible
  function initHeadersFromCookies() {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      capturedHeaders['x-csrf-token'] = csrfToken;
      // Default bearer token (public)
      capturedHeaders['authorization'] = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
      authHeaders = { ...capturedHeaders };
      headersReady = true;
    }
  }
  
  // Initialize immediately
  initHeadersFromCookies();
  
  // Also try periodically in case cookies aren't ready yet
  const initInterval = setInterval(() => {
    if (!headersReady) {
      initHeadersFromCookies();
    } else {
      clearInterval(initInterval);
    }
  }, 500);
  
  // Clear interval after 10 seconds regardless
  setTimeout(() => clearInterval(initInterval), 10000);
  
  // Process queue with rate limiting
  async function processQueue() {
    if (isProcessingQueue || requestQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (requestQueue.length > 0) {
      const { screenName, requestId, resolve } = requestQueue.shift();
      
      // Rate limit: ensure minimum interval between requests
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
      }
      
      try {
        const result = await fetchAccountInfo(screenName);
        lastRequestTime = Date.now();
        
        // Send result back
        window.postMessage({
          type: '__locationResult',
          requestId,
          screenName,
          data: result
        }, '*');
        
        if (resolve) resolve(result);
      } catch (error) {
        console.error(`[X-Location] Error fetching ${screenName}:`, error);
        window.postMessage({
          type: '__locationResult',
          requestId,
          screenName,
          data: null,
          error: error.message
        }, '*');
        
        if (resolve) resolve(null);
      }
    }
    
    isProcessingQueue = false;
  }
  
  // Fetch account info from Twitter API
  async function fetchAccountInfo(screenName) {
    if (!headersReady || !authHeaders) {
      // Try to init from cookies one more time
      initHeadersFromCookies();
      
      if (!headersReady) {
        throw new Error('Auth headers not ready');
      }
    }
    
    const variables = JSON.stringify({ screenName });
    const url = `https://x.com/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery?variables=${encodeURIComponent(variables)}`;
    
    const headers = {
      'Accept': '*/*',
      'Content-Type': 'application/json',
      ...authHeaders
    };
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: headers
    });
    
    if (response.status === 429) {
      const resetTime = response.headers.get('x-rate-limit-reset');
      if (resetTime) {
        const resetDate = new Date(parseInt(resetTime) * 1000);
        const now = new Date();
        const waitSeconds = Math.ceil((resetDate - now) / 1000);
        console.log(`[X-Location] Rate limited. Next request available at ${resetDate.toLocaleTimeString()} (in ${waitSeconds} seconds)`);
      } else {
        console.log('[X-Location] Rate limited. Reset time unknown.');
      }
      throw new Error('Rate limited');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract the relevant fields
    const aboutProfile = data?.data?.user_result_by_screen_name?.result?.about_profile;
    
    if (!aboutProfile) {
      return null;
    }
    
    return {
      accountBasedIn: aboutProfile.account_based_in || null,
      connectedVia: aboutProfile.source || null,
      createdAt: aboutProfile.created_at || null
    };
  }
  
  // Listen for requests from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data && event.data.type === '__fetchLocation') {
      const { screenName, requestId } = event.data;
      
      // Add to queue
      requestQueue.push({ screenName, requestId });
      
      // Process queue
      processQueue();
    }
  });
  
  // Signal that page script is ready
  window.postMessage({ type: '__pageScriptReady' }, '*');
})();
