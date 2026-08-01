# LiveKit probes

The production transport is signaling on TCP 7880 (`wss://` through the reverse proxy), WebRTC TCP
fallback on 7881, and the single multiplexed UDP media port 50000. All three paths must reach the
LiveKit host.

`npm run test:rotation` starts a disposable LiveKit server, establishes a real
WebRTC peer connection, rotates its credentials, proves the stale credential is
rejected, and reconnects with the new credential. Docker and Node 22 are
required. Set `LIVEKIT_PROBE_NODE_IMAGE=node:22-bookworm-slim` to run the Node
probe in Docker on a host without Node.

For a deployed instance, mint a short-lived probe token on the API host and run
the probe from a client network outside both the LiveKit host and its LAN:

```sh
LIVEKIT_URL=wss://livekit.example.com \
LIVEKIT_TOKEN=short-lived-token \
node lk-probe.mjs --room edge-check --connect-only
```

The token should grant room join only and expire within a few minutes. The
probe never prints it. Running from the LiveKit LAN is not a public-edge test:
ICE can select a direct or peer-reflexive path and hide a broken VPS/WireGuard
relay, which is the failure this external check is intended to catch.

GitHub CI runs the disposable credential-rotation/peer-connectivity probe and the config-render
test on every change. That proves config and local transport behavior; the external connect-only
probe is still required to prove a deployment's public routing.
