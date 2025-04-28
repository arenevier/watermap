// https://www.reddit.com/r/javascript/comments/1etp4az/askjs_the_most_simplest_javascript_mutex/
class AsyncMutex {
  #lock = Promise.resolve();

  async acquire() {
    return new Promise(function(resolve) {
      this.#lock = this.#lock.then(function() { return new Promise(resolve); });
      return this.#lock;
    });
  }
}

const CacheMutex = new Map();

async function fetchAndPutInCache(request, cacheName, limit = -1) {
  const cache = await caches.open(cacheName);

  try {
    let mutex, release;
    if (limit > 0) {
      if (CacheMutex.has(cacheName)) {
        mutex = CacheMutex.get(cacheName);
      } else {
        mutex = new AsyncMutex;
        CacheMutex.set(cacheName, mutex);
      }
    }

    const response = await fetch(request);
    if (limit > 0) {
      release = await mutex.acquire();
    }
    cache.put(request, response.clone());

    if (limit > 0) {
      const items = await cache.keys();
      if (items.length > limit) {
        await cache.delete(items[0]);
      }
      release();
    }

    return response;
  } catch (e) {
    return await cache.match(request);
  }
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('.html')) { // main document
    return event.respondWith(fetchAndPutInCache(event.request), 'resources');
  }
  if (url.host === 'unpkg.com') { // scripts, styles, etc
    return event.respondWith(fetchAndPutInCache(event.request), 'resources');
  }

  if (url.host === 'tile.openstreetmap.org') {
    const zoom = url.pathname.split('/')[1];
    return event.respondWith(fetchAndPutInCache(event.request, `tiles-${zoom}`, 50))
  }

  if (url.host === "overpass-api.de") {
    const data = url.searchParams.get('data');
    const bboxRegex = /node\(([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+)\)/;
    const bboxMatch = data.match(bboxRegex);
    const bbox = {
      south: parseFloat(bboxMatch[1]),
      west: parseFloat(bboxMatch[1]),
      north: parseFloat(bboxMatch[1]),
      east: parseFloat(bboxMatch[1]),
    }
    const amenityRegex = /\[amenity=(\w+)]/;
    const amenityMatch = data.match(amenityRegex);
    const amenity = amenityMatch[1];
    return event.respondWith(async function() {
      const response = await fetch(event.request);
      const data = await response.clone().json();
      console.log(bbox, amenity, data);
      return response;
    }())
  }

});
