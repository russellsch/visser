---
format: visser/1
docId: 9c0c5e2a-9999-4a99-8a99-999999999971
title: Order flow
kind: teaching
capturedAt: 2026-10-10T00:00:00Z
visibility: private
---

{% flowchart id="order" title="Validate an order" question="Can the order proceed?" direction="down" %}
{% group id="validation" label="Validation" color="teal" /%}
{% group id="repair" label="Repair" parent="validation" color="amber" collapsed=true /%}
{% start id="received" label="Order received" /%}
{% action id="check" label="Check order" group="validation" /%}
{% decision id="valid" label="Order valid?" group="validation" /%}
{% action id="correct" label="Correct order" group="repair" /%}
{% end id="ready" label="Ready" /%}
{% flow id="receive-check" from="received" to="check" /%}
{% flow id="check-valid" from="check" to="valid" /%}
{% flow id="yes" from="valid" to="ready" label="Yes" /%}
{% flow id="no" from="valid" to="correct" label="No" /%}
{% flow id="retry" from="correct" to="check" label="Corrected" /%}
{% /flowchart %}
