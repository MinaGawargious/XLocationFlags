// Page script - runs in the page context to access cookies and make authenticated requests
(function() {
  'use strict';
  
  // Store for captured auth headers
  let authHeaders = null;
  let headersReady = false;
  
  // Toast state
  let toastDismissed = false;
  let toastInterval = null;
  
  function showRateLimitToast(resetTimestamp) {
    // Don't show if user dismissed it
    if (toastDismissed) return;
    
    // Don't create duplicate
    if (document.getElementById('x-location-rate-limit-toast')) return;
    
    const toast = document.createElement('div');
    toast.id = 'x-location-rate-limit-toast';
    toast.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 1px solid rgba(244, 33, 46, 0.3);
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      color: #e7e9ea;
      opacity: 0;
      transition: transform 0.3s ease, opacity 0.3s ease;
    `;
    
    toast.innerHTML = `
      <span style="font-size: 18px; line-height: 1;">⏳</span>
      <span style="font-weight: 500; white-space: nowrap;">X Location Badges rate limited</span>
      <span id="x-location-countdown" style="font-weight: 700; color: #f4212e; font-variant-numeric: tabular-nums; min-width: 50px; text-align: center; padding: 4px 10px; background: rgba(244, 33, 46, 0.15); border-radius: 6px;"></span>
      <button id="x-location-toast-close" style="background: none; border: none; color: #71767b; font-size: 20px; line-height: 1; padding: 0 0 0 8px; cursor: pointer;">×</button>
    `;
    
    document.body.appendChild(toast);
    
    // Close button
    document.getElementById('x-location-toast-close').onclick = () => {
      toastDismissed = true;
      hideRateLimitToast();
    };
    
    // Update countdown
    function updateCountdown() {
      const countdown = document.getElementById('x-location-countdown');
      if (!countdown) return;
      
      if (!resetTimestamp) {
        countdown.textContent = '...';
        return;
      }
      
      const now = Date.now();
      const remaining = Math.max(0, resetTimestamp - now);
      
      if (remaining <= 0) {
        hideRateLimitToast();
        return;
      }
      
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.ceil((remaining % 60000) / 1000);
      
      countdown.textContent = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
    
    updateCountdown();
    toastInterval = setInterval(updateCountdown, 1000);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
      toast.style.opacity = '1';
    });
  }
  
  function hideRateLimitToast() {
    if (toastInterval) {
      clearInterval(toastInterval);
      toastInterval = null;
    }
    const toast = document.getElementById('x-location-rate-limit-toast');
    if (toast) {
      toast.style.transform = 'translateX(-50%) translateY(-100px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }
  }
  
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
      let resetTimestamp = null;
      if (resetTime) {
        resetTimestamp = parseInt(resetTime) * 1000;
        const resetDate = new Date(resetTimestamp);
        const now = new Date();
        const waitSeconds = Math.ceil((resetDate - now) / 1000);
        console.log(`[X-Location] Rate limited. Next request available at ${resetDate.toLocaleTimeString()} (in ${waitSeconds} seconds)`);
      } else {
        // Default to 15 minutes if no reset time provided
        resetTimestamp = Date.now() + 15 * 60 * 1000;
        console.log('[X-Location] Rate limited. Reset time unknown, assuming 15 minutes.');
      }
      
      showRateLimitToast(resetTimestamp);
      
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
      createdAt: aboutProfile.created_at || null,
      locationAccurate: aboutProfile.location_accurate !== false
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