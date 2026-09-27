---
format: visser/1
docId: ebbd43ef-7f3a-4429-8552-f7ca8da68fab
title: What the log shows about the stall
kind: root-cause
capturedAt: 2026-09-27T00:00:00Z
reader:
  profile: experienced-systems-engineer
  knows: [threads, queues]
  new: [this example]
  mustUnderstand: [the mechanism]
visibility: private
---

<!-- vs:id overview -->
# What the log shows about the stall

<!-- vs:id p_claim -->
The stall always starts with a cache expiry.

{% source id="src_log" kind="example" title="Illustrative cache and pool log" language="text" start=1 end=6 excerptSha256="0fdc481c509983652fa861eff76950383f95f2de3d2607d6ef756b869b9de215" %}
```text
12:00:00.004 cache  expire key=product:42
12:00:00.019 cache  miss key=product:42
12:00:00.020 cache  miss key=product:42
12:00:00.021 db     query SELECT * FROM products WHERE id = 42
12:00:00.022 db     query SELECT * FROM products WHERE id = 42
12:00:00.310 pool   in_use=50/50 waiting=37
```
{% /source %}
