# Tram Tracker mock location provider

Temporary Socket.IO publisher for local testing without tram hardware. It reads `routes.json`, moves two simulated trams along the configured loops, and sends positions to the web backend. The container can be removed when a hardware publisher is ready.

## Complete local stack

From the sibling `tram-tracker` workspace root:

```sh
docker compose --profile mock up -d --build
```

The map is available at `http://localhost:8081/tram/`. To run the stack without the mock publisher, start only `redis`, `backend`, and `frontend` with `docker compose up -d --build` after stopping any existing mock container.

## Standalone development

Requires Node.js 18, npm, and a running backend.

```sh
npm ci
BACKEND_URL=http://localhost:8080 npm start
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKEND_URL` | `http://backend:8080` | Socket.IO backend address |
| `MOCK_INTERVAL_MS` | `500` | Position publication interval in milliseconds |
| `MOCK_SPEED_MPS` | `10` | Movement speed in meters per second |
| `MOCK_TRAM_2_START_DELAY_MS` | `4000` | Delay before the first `tram_2` update |

The workspace Compose file sets `MOCK_SPEED_MPS` to 20 by default. The second tram starts four seconds after the first publisher connection. Each route loops continuously.

## Routes and payload

`routes.json` holds named latitude and longitude points and ordered point IDs for `tram_1` and `tram_2`. The publisher interpolates positions between points and emits `update-tram-data`:

```json
{
  "tramId": "tram_1",
  "data": {
    "c": { "lat": 13.612214, "lon": 100.836749, "t": "2026-09-27T12:00:00.000Z" },
    "p": { "lat": 13.612210, "lon": 100.836745, "t": "2026-09-27T11:59:59.500Z" },
    "s": "active"
  }
}
```

`c` is the current position, `p` is the previous position, and `s` is the status. The backend stores the latest update in Redis and broadcasts it to map clients.

## Image publishing

Pushing to `main` builds and publishes `ghcr.io/au-journey/tram-mock-location-provider` with a moving `:main` tag and a commit-specific `:sha-<commit>` tag. The workflow only publishes the image; deployment remains manual. GHCR package visibility is configured separately after the first publication.
