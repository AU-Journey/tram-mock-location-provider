import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const routeData = JSON.parse(readFileSync(new URL('./routes.json', import.meta.url), 'utf8'));
const routes = Object.fromEntries(
  Object.entries(routeData.routes).map(([tramId, pointIds]) => [
    tramId,
    pointIds.map((pointId) => {
      const point = routeData.points[pointId];
      if (!point) throw new Error(`Unknown route point: ${pointId}`);
      return point;
    })
  ])
);
const intervalMs = Math.max(250, Number(process.env.MOCK_INTERVAL_MS || 500));
const speedMetersPerSecond = Math.max(1, Number(process.env.MOCK_SPEED_MPS || 10));
const tram2StartDelayMs = Math.max(0, Number(process.env.MOCK_TRAM_2_START_DELAY_MS || 4000));
const stepMeters = speedMetersPerSecond * intervalMs / 1000;
const backendUrl = process.env.BACKEND_URL || 'http://backend:8080';
const socket = io(backendUrl, { transports: ['websocket'] });

function distanceMeters(start, end) {
  return Math.hypot((end.lat - start.lat) * 111000, (end.lon - start.lon) * 108000);
}

function resampleRoute(waypoints) {
  const segments = waypoints.map((start, index) => {
    const end = waypoints[(index + 1) % waypoints.length];
    return { start, end, length: distanceMeters(start, end) };
  });
  const routeLength = segments.reduce((total, segment) => total + segment.length, 0);
  const sampleCount = Math.max(1, Math.ceil(routeLength / stepMeters));
  const distancePerSample = routeLength / sampleCount;
  const samples = [];
  let segmentIndex = 0;
  let distanceBeforeSegment = 0;

  for (let index = 0; index < sampleCount; index++) {
    const distanceAlongRoute = index * distancePerSample;

    while (segmentIndex < segments.length - 1 &&
      distanceAlongRoute >= distanceBeforeSegment + segments[segmentIndex].length) {
      distanceBeforeSegment += segments[segmentIndex].length;
      segmentIndex++;
    }

    const segment = segments[segmentIndex];
    const fraction = segment.length === 0
      ? 0
      : (distanceAlongRoute - distanceBeforeSegment) / segment.length;
    samples.push({
      lat: segment.start.lat + (segment.end.lat - segment.start.lat) * fraction,
      lon: segment.start.lon + (segment.end.lon - segment.start.lon) * fraction
    });
  }

  return samples;
}

const positions = Object.fromEntries(
  Object.entries(routes).map(([tramId, waypoints]) => [tramId, resampleRoute(waypoints)])
);
const indices = Object.fromEntries(Object.keys(positions).map((tramId) => [tramId, 0]));
const startedTrams = new Set();
let firstConnectedAt;
let publishInterval;

function publishPositions() {
  const now = Date.now();

  for (const [tramId, route] of Object.entries(positions)) {
    if (tramId === 'tram_2' && now - firstConnectedAt < tram2StartDelayMs) continue;

    const index = indices[tramId];
    const current = route[index];
    const previous = route[(index - 1 + route.length) % route.length];

    socket.emit('update-tram-data', {
      tramId,
      data: {
        c: { ...current, t: new Date(now).toISOString() },
        p: { ...previous, t: new Date(now - intervalMs).toISOString() },
        s: 'active'
      }
    });

    if (!startedTrams.has(tramId)) {
      console.log(`${tramId} started`);
      startedTrams.add(tramId);
    }

    indices[tramId] = (index + 1) % route.length;
  }
}

socket.on('connect', () => {
  if (firstConnectedAt === undefined) firstConnectedAt = Date.now();
  console.log(`Mock location publisher connected to ${backendUrl}`);
  clearInterval(publishInterval);
  publishPositions();
  publishInterval = setInterval(publishPositions, intervalMs);
});

socket.on('disconnect', () => {
  clearInterval(publishInterval);
});

socket.on('connect_error', (error) => {
  console.error(`Mock location publisher connection failed: ${error.message}`);
});

socket.on('tram-error', (error) => {
  console.error('Mock location update rejected:', error);
});
