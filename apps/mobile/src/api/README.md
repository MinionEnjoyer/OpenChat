# api

Typed REST client: generated schema types, fetch wrapper, auth header, per-call
request-id (04 §10), and the single-flight refresh interceptor (06 §5).

`schema.d.ts` is generated from `contracts/openapi.yaml` — never edit it by hand;
run the codegen and let `devctl verify` check for drift.
