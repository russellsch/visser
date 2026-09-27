---
format: explain/1
docId: 338508ba-1093-4c58-b8f8-bc45c01054bb
title: An edge cache answers most reads without reaching the origin
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [HTTP caching]
  new: [the request path in this illustrative site]
  mustUnderstand: [which reads reach the database, what a miss costs]
visibility: private
---

<!-- ex:id cdn_overview -->
# An edge cache answers most reads without reaching the origin

<!-- ex:id cdn_claim -->
A reader's request stops at the edge cache when the cache holds a fresh copy of
the article. Only a miss travels to the origin, and only the origin queries the
database. The load on the database therefore follows the miss rate, not the
reader count.

<!-- ex:id cdn_limits -->
This is an illustrative site, not a measured one. It ignores revalidation,
private responses, and cache eviction; each of those adds requests to the
origin.

{% mermaid id="cdn_path" title="Only a miss reaches the origin" question="Which requests reach the article database?" %}
The labelled arrow `miss_fetch` is the only path from the edge to the origin
site.

```mermaid
flowchart LR
  Browser[Reader browser] -->|GET /article| EdgeCache[Edge cache]
  EdgeCache -->|hit: stored copy| Browser
  EdgeCache miss_fetch@-->|miss: fetch<br>then store| OriginApi
  subgraph OriginSite [Origin site]
    OriginApi[Origin API] -->|render query| ArticleDb[(Article database)]
  end
  classDef cachetier fill:#e8f0fe,stroke:#1a56db
  class EdgeCache cachetier
```
{% /mermaid %}

<!-- ex:id cdn_cost -->
A miss costs one origin render and one database query, and the edge stores the
result for the next reader. A burst of readers who all miss at the same moment
would still reach the origin together; request coalescing at the edge is the
usual remedy, and it is not shown here.
