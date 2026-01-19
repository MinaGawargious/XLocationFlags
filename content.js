// Content script for X Location Badges
(function() {
  'use strict';
  
  // ==================== CONFIGURATION ====================
  const CONFIG = {
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours for successful lookups
    ERROR_CACHE_DURATION: 30 * 60 * 1000, // 30 minutes for errors
    MAX_CONCURRENT_REQUESTS: 3,
    REQUEST_DEBOUNCE: 100,
    OBSERVER_DEBOUNCE: 150,
    MAX_CACHE_SIZE: 5000,
    BADGE_CLASS: 'x-location-badge',
    PROCESSED_ATTR: 'data-xloc-processed'
  };
  
  // ==================== STATE ====================
  const state = {
    cache: new Map(),
    pendingRequests: new Map(),
    requestQueue: [],
    activeRequests: 0,
    pageScriptReady: false,
    requestIdCounter: 0,
    processedElements: new WeakSet(),
    observerTimeout: null,
    dismissedResetTimestamp: null,
    currentToast: null,
    countdownInterval: null
  };
  
  // ==================== LOCATION MAPPINGS (inline for content script) ====================
  const COUNTRY_TO_CODE = {
    'united states': 'US', 'usa': 'US', 'us': 'US',
    'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB',
    'canada': 'CA', 'australia': 'AU', 'germany': 'DE', 'france': 'FR',
    'japan': 'JP', 'china': 'CN', 'india': 'IN', 'brazil': 'BR',
    'mexico': 'MX', 'spain': 'ES', 'italy': 'IT', 'russia': 'RU',
    'south korea': 'KR', 'korea': 'KR', 'netherlands': 'NL',
    'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
    'poland': 'PL', 'switzerland': 'CH', 'austria': 'AT', 'belgium': 'BE',
    'ireland': 'IE', 'portugal': 'PT', 'greece': 'GR', 'turkey': 'TR',
    'israel': 'IL', 'saudi arabia': 'SA', 'united arab emirates': 'AE', 'uae': 'AE',
    'egypt': 'EG', 'south africa': 'ZA', 'nigeria': 'NG', 'kenya': 'KE',
    'argentina': 'AR', 'chile': 'CL', 'colombia': 'CO', 'peru': 'PE',
    'venezuela': 'VE', 'indonesia': 'ID', 'thailand': 'TH', 'vietnam': 'VN',
    'philippines': 'PH', 'malaysia': 'MY', 'singapore': 'SG', 'taiwan': 'TW',
    'hong kong': 'HK', 'new zealand': 'NZ', 'pakistan': 'PK', 'bangladesh': 'BD',
    'ukraine': 'UA', 'czech republic': 'CZ', 'czechia': 'CZ', 'romania': 'RO',
    'hungary': 'HU', 'slovakia': 'SK', 'croatia': 'HR', 'serbia': 'RS',
    'bulgaria': 'BG', 'morocco': 'MA', 'algeria': 'DZ', 'tunisia': 'TN',
    'iraq': 'IQ', 'iran': 'IR', 'afghanistan': 'AF', 'qatar': 'QA',
    'kuwait': 'KW', 'oman': 'OM', 'bahrain': 'BH', 'jordan': 'JO',
    'lebanon': 'LB', 'syria': 'SY', 'yemen': 'YE', 'ethiopia': 'ET',
    'ghana': 'GH', 'tanzania': 'TZ', 'uganda': 'UG', 'zimbabwe': 'ZW',
    'cuba': 'CU', 'puerto rico': 'PR', 'dominican republic': 'DO',
    'jamaica': 'JM', 'haiti': 'HT', 'costa rica': 'CR', 'panama': 'PA',
    'guatemala': 'GT', 'ecuador': 'EC', 'bolivia': 'BO', 'paraguay': 'PY',
    'uruguay': 'UY', 'el salvador': 'SV', 'honduras': 'HN', 'nicaragua': 'NI',
    'luxembourg': 'LU', 'iceland': 'IS', 'malta': 'MT', 'cyprus': 'CY',
    'estonia': 'EE', 'latvia': 'LV', 'lithuania': 'LT', 'slovenia': 'SI',
    'bosnia and herzegovina': 'BA', 'bosnia': 'BA', 'north macedonia': 'MK',
    'macedonia': 'MK', 'albania': 'AL', 'montenegro': 'ME', 'kosovo': 'XK',
    'belarus': 'BY', 'moldova': 'MD', 'georgia': 'GE', 'armenia': 'AM',
    'azerbaijan': 'AZ', 'kazakhstan': 'KZ', 'uzbekistan': 'UZ',
    'turkmenistan': 'TM', 'kyrgyzstan': 'KG', 'tajikistan': 'TJ',
    'mongolia': 'MN', 'myanmar': 'MM', 'burma': 'MM', 'cambodia': 'KH',
    'laos': 'LA', 'nepal': 'NP', 'sri lanka': 'LK', 'brunei': 'BN',
    'maldives': 'MV', 'bhutan': 'BT', 'fiji': 'FJ', 'papua new guinea': 'PG',
    'cameroon': 'CM', 'ivory coast': 'CI', "côte d'ivoire": 'CI',
    'senegal': 'SN', 'mali': 'ML', 'burkina faso': 'BF', 'niger': 'NE',
    'chad': 'TD', 'sudan': 'SD', 'south sudan': 'SS', 'eritrea': 'ER',
    'djibouti': 'DJ', 'somalia': 'SO', 'rwanda': 'RW', 'burundi': 'BI',
    'democratic republic of the congo': 'CD', 'drc': 'CD', 'congo': 'CG',
    'gabon': 'GA', 'angola': 'AO', 'zambia': 'ZM', 'malawi': 'MW',
    'mozambique': 'MZ', 'madagascar': 'MG', 'mauritius': 'MU',
    'namibia': 'NA', 'botswana': 'BW', 'lesotho': 'LS', 'eswatini': 'SZ',
    'liberia': 'LR', 'sierra leone': 'SL', 'guinea': 'GN', 'gambia': 'GM',
    'mauritania': 'MR', 'libya': 'LY', 'togo': 'TG', 'benin': 'BJ',
    'bahamas': 'BS', 'barbados': 'BB', 'trinidad and tobago': 'TT',
    'guyana': 'GY', 'suriname': 'SR', 'belize': 'BZ', 'bermuda': 'BM',
    'cayman islands': 'KY', 'aruba': 'AW', 'curaçao': 'CW', 'curacao': 'CW',
    'gibraltar': 'GI', 'andorra': 'AD', 'monaco': 'MC', 'san marino': 'SM',
    'vatican': 'VA', 'liechtenstein': 'LI', 'faroe islands': 'FO',
    'greenland': 'GL', 'macau': 'MO', 'macao': 'MO', 'timor-leste': 'TL',
    'north korea': 'KP', 'palestine': 'PS', 'european union': 'EU', 'eu': 'EU'
  };
  
  const REGION_CODES = {
    'africa': 'AFRICA', 'north africa': 'AFRICA', 'west africa': 'AFRICA',
    'east africa': 'AFRICA', 'central africa': 'AFRICA', 'southern africa': 'AFRICA',
    'europe': 'EUROPE', 'western europe': 'EUROPE', 'eastern europe': 'EUROPE',
    'northern europe': 'EUROPE', 'southern europe': 'EUROPE',
    'north america': 'NAMERICA', 'south america': 'SAMERICA',
    'central america': 'CAMERICA', 'latin america': 'LATAM',
    'caribbean': 'CARIBBEAN', 'the americas': 'AMERICAS', 'americas': 'AMERICAS',
    'asia': 'ASIA', 'east asia': 'EASIA', 'southeast asia': 'SEASIA',
    'south asia': 'SASIA', 'central asia': 'CASIA', 'west asia': 'WASIA',
    'middle east': 'MEAST', 'oceania': 'OCEANIA', 'australasia': 'OCEANIA'
  };
  
  const GLOBE_URLS = {
    'AFRICA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30d.svg',
    'EUROPE': 'https://abs-0.twimg.com/emoji/v2/svg/1f30d.svg',
    'NAMERICA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30e.svg',
    'SAMERICA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30e.svg',
    'CAMERICA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30e.svg',
    'LATAM': 'https://abs-0.twimg.com/emoji/v2/svg/1f30e.svg',
    'CARIBBEAN': 'https://abs-0.twimg.com/emoji/v2/svg/1f30e.svg',
    'AMERICAS': 'https://abs-0.twimg.com/emoji/v2/svg/1f30e.svg',
    'ASIA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30f.svg',
    'EASIA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30f.svg',
    'SEASIA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30f.svg',
    'SASIA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30f.svg',
    'CASIA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30f.svg',
    'WASIA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30f.svg',
    'MEAST': 'https://abs-0.twimg.com/emoji/v2/svg/1f30f.svg',
    'OCEANIA': 'https://abs-0.twimg.com/emoji/v2/svg/1f30f.svg',
    'WORLD': 'https://abs-0.twimg.com/emoji/v2/svg/1f310.svg'
  };
  
  // ==================== UTILITY FUNCTIONS ====================
  
  function isoCodeToFlagUrl(code) {
    if (!code || code.length !== 2) return null;
    const upper = code.toUpperCase();
    const first = (0x1F1E6 + upper.charCodeAt(0) - 65).toString(16);
    const second = (0x1F1E6 + upper.charCodeAt(1) - 65).toString(16);
    return `https://abs-0.twimg.com/emoji/v2/svg/${first}-${second}.svg`;
  }
  
  function getLocationImageUrl(location) {
    if (!location) return null;
    
    const normalized = location.toLowerCase().trim();
    
    // Check for country
    const countryCode = COUNTRY_TO_CODE[normalized];
    if (countryCode) {
      return isoCodeToFlagUrl(countryCode);
    }
    
    // Check for region
    const regionCode = REGION_CODES[normalized];
    if (regionCode) {
      return GLOBE_URLS[regionCode] || GLOBE_URLS['WORLD'];
    }
    
    // Partial match for countries
    for (const [country, code] of Object.entries(COUNTRY_TO_CODE)) {
      if (normalized.includes(country) || country.includes(normalized)) {
        return isoCodeToFlagUrl(code);
      }
    }
    
    // Partial match for regions
    for (const [region, code] of Object.entries(REGION_CODES)) {
      if (normalized.includes(region) || region.includes(normalized)) {
        return GLOBE_URLS[code] || GLOBE_URLS['WORLD'];
      }
    }
    
    return GLOBE_URLS['WORLD'];
  }
  
  function getPlatformImageUrl(connectedVia) {
    if (!connectedVia) return null;
    
    const normalized = connectedVia.toLowerCase();
    
    // Apple / App Store
    if (normalized.includes('app store') || normalized.includes('ios')) {
      return 'https://abs-0.twimg.com/emoji/v2/svg/1f34e.svg'; // 🍎
    }
    
    // Android / Play Store
    if (normalized.includes('android') || normalized.includes('play store') || normalized.includes('google play')) {
      return 'https://abs-0.twimg.com/emoji/v2/svg/1f916.svg'; // 🤖
    }
    
    // Web
    return 'https://abs-0.twimg.com/emoji/v2/svg/1f310.svg'; // 🌐
  }
  
  function extractCountryFromConnectedVia(connectedVia) {
    if (!connectedVia) return null;
    
    let country = connectedVia.toLowerCase().trim()
      .replace(/\s*app\s*store\s*$/i, '')
      .replace(/\s*play\s*store\s*$/i, '')
      .replace(/\s*google\s*play\s*$/i, '')
      .trim();
    
    if (!country || country === 'web' || country === 'browser') {
      return null;
    }
    
    return country;
  }
  
  // ==================== CACHE MANAGEMENT ====================
  
  function loadCache() {
    try {
      const cached = localStorage.getItem('x_location_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        
        // Filter out expired entries
        for (const [key, value] of Object.entries(parsed)) {
          if (value.timestamp && (now - value.timestamp) < CONFIG.CACHE_DURATION) {
            state.cache.set(key, value);
          }
        }
      }
    } catch (e) {
      console.warn('[X-Location] Failed to load cache:', e);
    }
  }
  
  function saveCache() {
    try {
      // Limit cache size
      if (state.cache.size > CONFIG.MAX_CACHE_SIZE) {
        const entries = [...state.cache.entries()];
        entries.sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
        const toDelete = entries.slice(0, entries.length - CONFIG.MAX_CACHE_SIZE);
        toDelete.forEach(([key]) => state.cache.delete(key));
      }
      
      const obj = Object.fromEntries(state.cache);
      localStorage.setItem('x_location_cache', JSON.stringify(obj));
    } catch (e) {
      console.warn('[X-Location] Failed to save cache:', e);
    }
  }
  
  function getCached(screenName) {
    const key = screenName.toLowerCase();
    const cached = state.cache.get(key);
    
    if (!cached) return null;
    
    const now = Date.now();
    const maxAge = cached.error ? CONFIG.ERROR_CACHE_DURATION : CONFIG.CACHE_DURATION;
    
    if ((now - cached.timestamp) > maxAge) {
      state.cache.delete(key);
      return null;
    }
    
    return cached;
  }
  
  function setCache(screenName, data, error = false) {
    const key = screenName.toLowerCase();
    state.cache.set(key, {
      data,
      error,
      timestamp: Date.now()
    });
    
    // Debounced save
    clearTimeout(state.saveCacheTimeout);
    state.saveCacheTimeout = setTimeout(saveCache, 1000);
  }
  
  // ==================== API REQUESTS ====================
  
  function generateRequestId() {
    return `req_${Date.now()}_${state.requestIdCounter++}`;
  }
  
  function requestLocation(screenName) {
    return new Promise((resolve) => {
      const cached = getCached(screenName);
      if (cached) {
        resolve(cached.data);
        return;
      }
      
      // Check if already pending
      const pending = state.pendingRequests.get(screenName.toLowerCase());
      if (pending) {
        pending.callbacks.push(resolve);
        return;
      }
      
      // Create new pending request
      const requestId = generateRequestId();
      state.pendingRequests.set(screenName.toLowerCase(), {
        requestId,
        callbacks: [resolve]
      });
      
      // Queue the request
      state.requestQueue.push({ screenName, requestId });
      processQueue();
    });
  }
  
  function processQueue() {
    if (!state.pageScriptReady) return;
    
    while (state.requestQueue.length > 0 && state.activeRequests < CONFIG.MAX_CONCURRENT_REQUESTS) {
      const { screenName, requestId } = state.requestQueue.shift();
      state.activeRequests++;
      
      window.postMessage({
        type: '__fetchLocation',
        screenName,
        requestId
      }, '*');
    }
  }
  
  // Handle responses from page script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;

    if (event.data && event.data.type === '__pageScriptReady') {
      state.pageScriptReady = true;
      processQueue();
      return;
    }

    if (event.data && event.data.type === '__rateLimited') {
      showRateLimitToast(event.data.resetTimestamp);
      return;
    }

    if (event.data && event.data.type === '__locationResult') {
      const { screenName, data, error } = event.data;
      const key = screenName.toLowerCase();
      
      state.activeRequests = Math.max(0, state.activeRequests - 1);
      
      // Cache the result
      setCache(screenName, data, !!error);
      
      // Resolve pending callbacks
      const pending = state.pendingRequests.get(key);
      if (pending) {
        pending.callbacks.forEach(cb => cb(data));
        state.pendingRequests.delete(key);
      }
      
      // Process more from queue
      processQueue();
    }
  });
  
  // ==================== RATE LIMIT TOAST ====================

  function showRateLimitToast(resetTimestamp) {
    // Don't show if this specific countdown was dismissed
    if (state.dismissedResetTimestamp === resetTimestamp) {
      return;
    }

    // Remove existing toast if any
    hideRateLimitToast();

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'x-location-toast';

    const textSpan = document.createElement('span');
    textSpan.className = 'x-location-toast-text';
    toast.appendChild(textSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'x-location-toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => {
      state.dismissedResetTimestamp = resetTimestamp;
      hideRateLimitToast();
    });
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);
    state.currentToast = toast;

    // Update countdown every second
    function updateCountdown() {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((resetTimestamp - now) / 1000));

      if (remaining <= 0) {
        hideRateLimitToast();
        // Clear dismissed state so future rate limits show the toast
        state.dismissedResetTimestamp = null;
        return;
      }

      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      const timeStr = minutes > 0
        ? `${minutes}m ${seconds}s`
        : `${seconds}s`;

      textSpan.textContent = `Rate limited. Retry in ${timeStr}`;
    }

    // Initial update
    updateCountdown();

    // Start interval
    state.countdownInterval = setInterval(updateCountdown, 1000);
  }

  function hideRateLimitToast() {
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
      state.countdownInterval = null;
    }
    if (state.currentToast) {
      state.currentToast.remove();
      state.currentToast = null;
    }
  }

  // ==================== DOM MANIPULATION ====================

  function createBadge(basedInUrl, connectedViaUrl, platformUrl, tooltipText) {
    const container = document.createElement('span');
    container.className = CONFIG.BADGE_CLASS;
    container.title = tooltipText;
    
    // Based-in flag
    if (basedInUrl) {
      const basedInImg = document.createElement('img');
      basedInImg.src = basedInUrl;
      basedInImg.className = 'x-loc-flag';
      basedInImg.alt = 'Based in';
      container.appendChild(basedInImg);
    }
    
    // Connected-via country flag (if different from based-in)
    if (connectedViaUrl && connectedViaUrl !== basedInUrl) {
      const connectedImg = document.createElement('img');
      connectedImg.src = connectedViaUrl;
      connectedImg.className = 'x-loc-flag';
      connectedImg.alt = 'Connected via';
      container.appendChild(connectedImg);
    }
    
    // Platform icon
    if (platformUrl) {
      const platformImg = document.createElement('img');
      platformImg.src = platformUrl;
      platformImg.className = 'x-loc-platform';
      platformImg.alt = 'Platform';
      container.appendChild(platformImg);
    }
    
    return container;
  }
  
  function extractScreenName(element) {
    // Try to find the screen name from the element or its parents
    
    // Check for direct link with @username
    const text = element.textContent;
    if (text && text.startsWith('@')) {
      return text.slice(1).split(/[^a-zA-Z0-9_]/)[0];
    }
    
    // Check href
    const href = element.getAttribute('href');
    if (href) {
      const match = href.match(/^\/([a-zA-Z0-9_]+)(?:\/|$|\?)/);
      if (match && !['home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings', 'compose'].includes(match[1].toLowerCase())) {
        return match[1];
      }
    }
    
    // Look for nearby username link
    const parent = element.closest('[data-testid="User-Name"]') || 
                   element.closest('[data-testid="UserCell"]') ||
                   element.closest('article');
    
    if (parent) {
      const usernameLink = parent.querySelector('a[href^="/"]:not([href*="/status/"]):not([href*="/photo/"]):not([href*="/video/"])');
      if (usernameLink) {
        const linkHref = usernameLink.getAttribute('href');
        const linkMatch = linkHref.match(/^\/([a-zA-Z0-9_]+)(?:\/|$|\?)/);
        if (linkMatch && !['home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings'].includes(linkMatch[1].toLowerCase())) {
          return linkMatch[1];
        }
      }
    }
    
    return null;
  }
  
  async function processUsernameElement(element) {
    // Skip if already processed
    if (element.hasAttribute(CONFIG.PROCESSED_ATTR)) return;
    if (state.processedElements.has(element)) return;
    
    // Mark as processed immediately to prevent duplicate processing
    element.setAttribute(CONFIG.PROCESSED_ATTR, 'true');
    state.processedElements.add(element);
    
    // Extract screen name
    const screenName = extractScreenName(element);
    if (!screenName) return;
    
    // Check if badge already exists
    const existingBadge = element.parentElement?.querySelector(`.${CONFIG.BADGE_CLASS}`);
    if (existingBadge) return;
    
    // Request location data
    const data = await requestLocation(screenName);
    
    if (!data) return;
    
    // Create badge
    const basedInUrl = data.accountBasedIn ? getLocationImageUrl(data.accountBasedIn) : null;
    
    let connectedViaCountryUrl = null;
    const connectedViaCountry = extractCountryFromConnectedVia(data.connectedVia);
    if (connectedViaCountry) {
      connectedViaCountryUrl = getLocationImageUrl(connectedViaCountry);
    }
    
    const platformUrl = data.connectedVia ? getPlatformImageUrl(data.connectedVia) : null;
    
    // Build tooltip
    const tooltipParts = [];
    if (data.accountBasedIn) tooltipParts.push(`Based in: ${data.accountBasedIn}`);
    if (data.connectedVia) tooltipParts.push(`Connected via: ${data.connectedVia}`);
    const tooltip = tooltipParts.join('\n');
    
    // Only create badge if we have something to show
    if (!basedInUrl && !platformUrl) return;
    
    const badge = createBadge(basedInUrl, connectedViaCountryUrl, platformUrl, tooltip);
    
    // Insert badge after the element
    if (element.nextSibling) {
      element.parentElement.insertBefore(badge, element.nextSibling);
    } else {
      element.parentElement.appendChild(badge);
    }
  }
  
  function findUsernameElements() {
    const elements = [];
    const seen = new Set();
    
    // Reserved paths that are not usernames
    const reservedPaths = new Set([
      'home', 'explore', 'search', 'notifications', 'messages', 
      'i', 'settings', 'compose', 'login', 'logout', 'signup',
      'tos', 'privacy', 'about', 'help', 'download', 'verified'
    ]);
    
    function isValidUsername(href) {
      if (!href) return false;
      const match = href.match(/^\/([a-zA-Z0-9_]+)\/?$/);
      if (!match) return false;
      const username = match[1].toLowerCase();
      return username.length >= 1 && username.length <= 15 && !reservedPaths.has(username);
    }
    
    function addElement(el, screenName) {
      const key = `${screenName.toLowerCase()}-${el.closest('article')?.dataset?.testid || Math.random()}`;
      if (!seen.has(key)) {
        seen.add(key);
        elements.push(el);
      }
    }
    
    // 1. Find @username in tweet/post headers (User-Name containers)
    document.querySelectorAll('[data-testid="User-Name"]').forEach(container => {
      const links = container.querySelectorAll('a[href^="/"]');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (isValidUsername(href)) {
          const text = link.textContent?.trim();
          // Prefer the one starting with @
          if (text && text.startsWith('@')) {
            addElement(link, text.slice(1));
          }
        }
      });
    });
    
    // 2. Find usernames in UserCell (followers/following/likes lists)
    document.querySelectorAll('[data-testid="UserCell"]').forEach(cell => {
      const links = cell.querySelectorAll('a[href^="/"]');
      for (const link of links) {
        const href = link.getAttribute('href');
        if (isValidUsername(href)) {
          const screenName = href.slice(1).replace(/\/$/, '');
          const text = link.textContent?.trim();
          if (text && text.startsWith('@')) {
            addElement(link, screenName);
            break;
          }
        }
      }
    });
    
    // 3. Find profile header username on profile pages
    document.querySelectorAll('[data-testid="UserProfileHeader_Items"]').forEach(header => {
      const parent = header.closest('[data-testid="UserName"]') || header.parentElement;
      if (parent) {
        const links = parent.querySelectorAll('a[href^="/"]');
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (isValidUsername(href)) {
            const text = link.textContent?.trim();
            if (text && text.startsWith('@')) {
              addElement(link, text.slice(1));
            }
          }
        });
      }
    });
    
    // 4. Find mentions in tweet text
    document.querySelectorAll('[data-testid="tweetText"] a[href^="/"]').forEach(link => {
      const href = link.getAttribute('href');
      if (isValidUsername(href)) {
        const text = link.textContent?.trim();
        if (text && text.startsWith('@')) {
          addElement(link, text.slice(1));
        }
      }
    });
    
    // 5. Find "Replying to @username" sections
    document.querySelectorAll('[data-testid="Tweet-User-Avatar"]').forEach(avatar => {
      const article = avatar.closest('article');
      if (article) {
        const replyLinks = article.querySelectorAll('a[href^="/"]');
        replyLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (isValidUsername(href)) {
            const text = link.textContent?.trim();
            if (text && text.startsWith('@')) {
              addElement(link, text.slice(1));
            }
          }
        });
      }
    });
    
    return elements;
  }
  
  function processPage() {
    const elements = findUsernameElements();
    elements.forEach(el => processUsernameElement(el));
  }
  
  // ==================== MUTATION OBSERVER ====================
  
  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      // Debounce processing
      clearTimeout(state.observerTimeout);
      state.observerTimeout = setTimeout(() => {
        processPage();
      }, CONFIG.OBSERVER_DEBOUNCE);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // ==================== PAGE SCRIPT INJECTION ====================
  
  function injectPageScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('pageScript.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }
  
  // ==================== INITIALIZATION ====================
  
  function init() {
    // Load cache from localStorage
    loadCache();
    
    // Inject page script for API access
    injectPageScript();
    
    // Initial page processing
    setTimeout(processPage, 500);
    
    // Setup mutation observer for dynamic content
    setupObserver();
    
    // Re-process on navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(processPage, 500);
      }
    }).observe(document, { subtree: true, childList: true });
    
    console.log('[X-Location] Extension initialized');
  }
  
  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
