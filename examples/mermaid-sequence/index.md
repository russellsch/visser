---
format: explain/1
docId: 64c930f4-6228-4ef3-887c-869c7f9484b4
title: An expired access token costs one extra round trip, not a new login
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [OAuth access and refresh tokens]
  new: [the retry path in this illustrative client]
  mustUnderstand: [when the user must log in again, where the refresh token goes]
visibility: private
---

<!-- ex:id tok_overview -->
# An expired access token costs one extra round trip, not a new login

<!-- ex:id tok_claim -->
When the reports API rejects an expired access token, the client asks the
token service for a new one with its refresh token and repeats the original
request. The user sees a slower response, not a login page, unless the refresh
token itself was revoked.

<!-- ex:id tok_limits -->
This is an illustrative client. It does not show token storage, clock skew, or
several tabs refreshing at the same time.

{% mermaid id="tok_refresh" title="Only a revoked refresh token sends the user back to login" question="What happens after the API answers 401?" %}
The loop runs at most twice; the alternative shows the two answers the token
service can give.

```mermaid
sequenceDiagram
  autonumber
  participant WebClient as Web client
  participant TokenService as Token service
  participant ReportsApi as Reports API
  WebClient->>ReportsApi: GET /reports with access token
  ReportsApi-->>WebClient: 401 access token expired
  Note over WebClient,TokenService: Only the token service ever sees the refresh token.
  loop at most two attempts
    WebClient->>TokenService: POST /token with refresh token
    alt refresh token still valid
      TokenService-->>WebClient: new access token
    else refresh token revoked
      TokenService-->>WebClient: 400 invalid_grant
    end
  end
  WebClient->>ReportsApi: GET /reports with new access token
```
{% /mermaid %}

<!-- ex:id tok_revoked -->
After `invalid_grant`, retrying cannot help: the client must start a new login.
Retrying on that answer only adds load to the token service.
