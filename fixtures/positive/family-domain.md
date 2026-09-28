---
format: visser/1
docId: 0d9a4f3e-5b1c-4e8a-9d2f-7c6b5a4e3d21
title: Orders and invoices
kind: reference
capturedAt: 2026-09-28T00:00:00Z
visibility: private
---

<!-- vs:id intro -->
# Orders and invoices

{% definition id="def_customer" term="customer" %}
A customer is a person or a company that places orders. The account keeps the billing address.
{% /definition %}

{% definition id="def_order" term="order" %}
An order is one request from a customer to buy one or more products.
{% /definition %}

{% definition id="def_line" term="invoice line" %}
An invoice line bills one product of an order at the price on the order date.
{% /definition %}

{% definition id="def_placed" term="order placed" %}
Order placed is the event that starts billing.
{% /definition %}

{% definition id="def_price" term="unit price" %}
A unit price is an amount of money for one unit of a product.
{% /definition %}

{% definition id="def_prepaid" term="prepaid customer" %}
A prepaid customer pays before the order ships.
{% /definition %}

{% domain id="orders_model" title="An order has invoice lines" question="Which things does billing talk about, and how do they relate?" %}
Read this once; the later sections use these words.

{% concept id="c_customer" label="Customer" definition="def_customer" category="actor" %}
Also called the account holder.
{% /concept %}
{% concept id="c_prepaid" label="Prepaid customer" definition="def_prepaid" category="actor" /%}
{% concept id="c_order" label="Order" definition="def_order" category="thing" attributes=["id", "state"] /%}
{% concept id="c_line" label="Invoice line" definition="def_line" category="thing" attributes=["quantity"] /%}
{% concept id="c_placed" label="Order placed" definition="def_placed" category="event" /%}
{% concept id="c_price" label="Unit price" definition="def_price" category="value" /%}

{% relation id="r_is_a" from="c_prepaid" to="c_customer" kind="is-a" label="is a kind of" /%}
{% relation id="r_places" from="c_customer" to="c_order" kind="uses" label="places" /%}
{% relation id="r_has" from="c_order" to="c_line" kind="has" label="contains" cardinality="1..*" %}
An order with no lines is not valid.
{% /relation %}
{% relation id="r_emits" from="c_order" to="c_placed" kind="produces" label="emits on submit" /%}
{% relation id="r_price" from="c_price" to="c_line" kind="identifies" label="prices" cardinality="1" /%}
{% /domain %}
