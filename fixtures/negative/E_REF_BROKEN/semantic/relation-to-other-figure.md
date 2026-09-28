---
format: visser/1
docId: 9c0c5e2a-9999-4a99-8a99-999999999999
title: Negative fixture
kind: teaching
capturedAt: 2026-09-27T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Negative fixture

{% definition id="def_order" term="order" %}
An order is one request to buy products.
{% /definition %}

{% definition id="def_line" term="invoice line" %}
An invoice line bills one product of an order.
{% /definition %}

{% domain id="fig" title="T" question="Q?" %}
Interpretation.

{% concept id="c_order" label="Order" definition="def_order" /%}
{% /domain %}

{% domain id="fig2" title="U" question="R?" %}
Interpretation.

{% concept id="c_line" label="Invoice line" definition="def_line" /%}
{% relation id="r_has" from="c_order" to="c_line" kind="has" label="contains" /%}
{% /domain %}
